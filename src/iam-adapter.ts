import { config } from './config';
import { logger } from './logger';

export interface IamLoginDiagnostics {
  status: number;
  statusText: string;
  url: string;
  upstreamMessage?: string;
  upstreamCode?: string | number;
  responseKeys?: string[];
  responseBody?: unknown;
}

export interface IamLoginError extends Error {
  diagnostics: IamLoginDiagnostics;
}

function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

function extractUpstreamMessage(body: unknown): { message?: string; code?: string | number } {
  if (!body || typeof body !== 'object') return {};
  const obj = body as Record<string, unknown>;
  const message =
    (typeof obj.message === 'string' ? obj.message : undefined) ||
    (typeof obj.error === 'string' ? obj.error : undefined) ||
    (typeof obj.msg === 'string' ? obj.msg : undefined) ||
    (Array.isArray(obj.errors) && typeof obj.errors[0] === 'string' ? obj.errors[0] : undefined);
  const code = (typeof obj.code === 'string' || typeof obj.code === 'number') ? obj.code : undefined;
  return { message, code };
}

function sanitizeResponseBody(body: unknown): unknown {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') {
    if (body.length > 500) return body.slice(0, 500) + '...(truncated)';
    return body;
  }
  if (typeof body !== 'object') return body;

  const sensitiveKeys = ['password', 'secret', 'token', 'access_token', 'refresh_token', 'authorization', 'cookie'];
  const obj = body as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitized[key] = `[object: ${Object.keys(obj[key] as object).join(', ')}]`;
    } else if (typeof obj[key] === 'string' && (obj[key] as string).length > 200) {
      sanitized[key] = (obj[key] as string).slice(0, 200) + '...(truncated)';
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
}

export async function loginByPassword(username: string, password: string): Promise<string> {
  const url = `${config.iam.baseUrl}${config.iam.loginPath}`;
  const sanitizedUrl = sanitizeUrl(url);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch (err: any) {
    const diagnostics: IamLoginDiagnostics = {
      status: 0,
      statusText: 'Connection failed',
      url: sanitizedUrl,
      upstreamMessage: err.message || 'Network error',
    };
    logger.error('IAM login connection failure', { url: sanitizedUrl, error: err.message });
    const error = new Error('Connection to authentication service failed') as IamLoginError;
    error.diagnostics = diagnostics;
    throw error;
  }

  let responseBody: unknown;
  const rawText = await res.text().catch(() => '');
  try {
    responseBody = JSON.parse(rawText);
  } catch {
    responseBody = rawText || null;
  }

  const { message: upstreamMessage, code: upstreamCode } = extractUpstreamMessage(responseBody);
  const responseKeys = (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody))
    ? Object.keys(responseBody as object)
    : undefined;

  if (!res.ok) {
    const diagnostics: IamLoginDiagnostics = {
      status: res.status,
      statusText: res.statusText,
      url: sanitizedUrl,
      upstreamMessage,
      upstreamCode: upstreamCode !== undefined ? String(upstreamCode) : undefined,
      responseKeys,
      responseBody: sanitizeResponseBody(responseBody),
    };

    logger.warn('IAM login failed', {
      username,
      status: res.status,
      statusText: res.statusText,
      url: sanitizedUrl,
      upstreamMessage,
      upstreamCode,
      responseKeys,
    });

    const errorMsg = upstreamMessage || `Authentication service returned ${res.status}`;
    const error = new Error(errorMsg) as IamLoginError;
    error.diagnostics = diagnostics;
    throw error;
  }

  // 200 OK — extract bearer token from parsed response
  const tokenBody = responseBody as Record<string, unknown> | null;
  let token: string | null = null;

  if (tokenBody && typeof tokenBody === 'object') {
    const tb = tokenBody as any;
    if (typeof tb.access_token === 'string') token = tb.access_token;
    else if (typeof tb.accessToken === 'string') token = tb.accessToken;
    else if (typeof tb.token === 'string') token = tb.token;
    else if (tb.data && typeof tb.data === 'object') {
      const d = tb.data;
      if (typeof d.accessToken === 'string') token = d.accessToken;
      else if (typeof d.access_token === 'string') token = d.access_token;
      else if (typeof d.token === 'string') token = d.token;
    }
  }

  if (!token) {
    const diagnostics: IamLoginDiagnostics = {
      status: res.status,
      statusText: res.statusText,
      url: sanitizedUrl,
      upstreamMessage: 'Sign-in succeeded but no session token was returned',
      responseKeys,
      responseBody: sanitizeResponseBody(responseBody),
    };

    logger.error('IAM login 200 but no token found in response', {
      username,
      url: sanitizedUrl,
      responseKeys,
    });

    const error = new Error('Sign-in succeeded but no session token was returned') as IamLoginError;
    error.diagnostics = diagnostics;
    throw error;
  }

  logger.info('IAM login successful', { username, url: sanitizedUrl });
  return token;
}
