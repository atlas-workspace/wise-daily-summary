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

export interface IamTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

function extractUpstreamMessage(body: unknown): { message?: string; code?: string | number } {
  if (!body || typeof body !== 'object') return {};
  const object = body as Record<string, unknown>;
  const message =
    (typeof object.message === 'string' ? object.message : undefined) ||
    (typeof object.error === 'string' ? object.error : undefined) ||
    (typeof object.msg === 'string' ? object.msg : undefined) ||
    (Array.isArray(object.errors) && typeof object.errors[0] === 'string' ? object.errors[0] : undefined);
  const code = (typeof object.code === 'string' || typeof object.code === 'number') ? object.code : undefined;
  return { message, code };
}

function sanitizeResponseBody(body: unknown): unknown {
  if (body === null || body === undefined) return null;
  if (typeof body === 'string') return body.length > 500 ? body.slice(0, 500) + '...(truncated)' : body;
  if (typeof body !== 'object') return body;

  const sensitiveKeys = ['password', 'secret', 'token', 'accesstoken', 'refreshtoken', 'access_token', 'refresh_token', 'authorization', 'cookie'];
  const object = body as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(object)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof object[key] === 'object' && object[key] !== null) {
      sanitized[key] = `[object: ${Object.keys(object[key] as object).join(', ')}]`;
    } else if (typeof object[key] === 'string' && object[key].length > 200) {
      sanitized[key] = object[key].slice(0, 200) + '...(truncated)';
    } else {
      sanitized[key] = object[key];
    }
  }
  return sanitized;
}

function getTokenData(responseBody: unknown): Record<string, unknown> | null {
  if (!responseBody || typeof responseBody !== 'object') return null;
  const body = responseBody as Record<string, unknown>;
  let data = body.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  return data && typeof data === 'object' ? data as Record<string, unknown> : body;
}

export function extractBearerToken(responseBody: unknown): string | null {
  const data = getTokenData(responseBody);
  if (!data) return null;
  const candidates = [data.access_token, data.accessToken, data.token, data.bearerToken, data.idToken];
  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
}

function extractTokenSet(responseBody: unknown, fallbackRefreshToken = ''): IamTokenSet | null {
  const data = getTokenData(responseBody);
  const accessToken = extractBearerToken(responseBody);
  if (!data || !accessToken) return null;

  const refreshTokenCandidate = data.refresh_token ?? data.refreshToken ?? fallbackRefreshToken;
  const refreshToken = typeof refreshTokenCandidate === 'string' ? refreshTokenCandidate : '';
  const expiresInCandidate = Number(data.expires_in ?? data.expiresIn ?? 3600);
  const expiresInSeconds = Number.isFinite(expiresInCandidate) && expiresInCandidate > 0 ? expiresInCandidate : 3600;

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

async function requestTokenSet(url: string, init: RequestInit, fallbackRefreshToken = ''): Promise<IamTokenSet> {
  const sanitizedUrl = sanitizeUrl(url);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error: any) {
    const diagnostics: IamLoginDiagnostics = {
      status: 0,
      statusText: 'Connection failed',
      url: sanitizedUrl,
      upstreamMessage: error.message || 'Network error',
    };
    logger.error('IAM token request connection failure', { url: sanitizedUrl, error: error.message });
    const iamError = new Error('Connection to authentication service failed') as IamLoginError;
    iamError.diagnostics = diagnostics;
    throw iamError;
  }

  const rawText = await response.text().catch(() => '');
  let responseBody: unknown;
  try { responseBody = JSON.parse(rawText); } catch { responseBody = rawText || null; }

  const { message: upstreamMessage, code: upstreamCode } = extractUpstreamMessage(responseBody);
  const responseKeys = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
    ? Object.keys(responseBody as object)
    : undefined;
  const codeSucceeded = upstreamCode === undefined || String(upstreamCode) === '0';
  const tokens = response.ok && codeSucceeded ? extractTokenSet(responseBody, fallbackRefreshToken) : null;

  if (!tokens) {
    const diagnostics: IamLoginDiagnostics = {
      status: response.status,
      statusText: response.statusText,
      url: sanitizedUrl,
      upstreamMessage: upstreamMessage || 'Authentication session could not be established',
      upstreamCode,
      responseKeys,
      responseBody: sanitizeResponseBody(responseBody),
    };
    logger.warn('IAM token request failed', {
      status: response.status,
      statusText: response.statusText,
      url: sanitizedUrl,
      upstreamMessage,
      upstreamCode,
      responseKeys,
    });
    const iamError = new Error(upstreamMessage || 'Authentication session could not be established') as IamLoginError;
    iamError.diagnostics = diagnostics;
    throw iamError;
  }

  return tokens;
}

export async function loginByPassword(username: string, password: string): Promise<IamTokenSet> {
  const url = `${config.iam.baseUrl}${config.iam.loginPath}`;
  const tokens = await requestTokenSet(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'password', username, password }),
  });
  logger.info('IAM login successful', { username, url: sanitizeUrl(url) });
  return tokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<IamTokenSet> {
  if (!refreshToken) {
    const error = new Error('Session expired') as IamLoginError;
    error.diagnostics = { status: 401, statusText: 'Missing refresh token', url: sanitizeUrl(config.iam.baseUrl) };
    throw error;
  }

  const url = `${config.iam.baseUrl}${config.iam.refreshPath}?refreshToken=${encodeURIComponent(refreshToken)}`;
  return requestTokenSet(url, { method: 'GET' }, refreshToken);
}
