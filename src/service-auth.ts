import { config } from './config';
import { logger } from './logger';
import { refreshAccessToken } from './iam-adapter';
import type { AuthContext } from './types';

/**
 * Server-side service authentication for WMS-backed endpoints.
 *
 * Priority:
 *   1. WMS_SERVICE_REFRESH_TOKEN (+ WMS_IAM_BASE_URL, falls back to IAM_BASE_URL):
 *      an auto-renewing service token. The refresh token is exchanged for an
 *      access token which is cached in memory and renewed before expiry.
 *   2. WMS_SERVICE_AUTHORIZATION: a pre-issued bearer token used directly.
 *
 * Service credentials are NEVER sent to the browser — they live only in
 * server environment variables and process memory.
 */

const TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000;

interface ServiceTokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let cachedToken: ServiceTokenState | null = null;
let renewPromise: Promise<ServiceTokenState | null> | null = null;

function isConfigured(): boolean {
  return Boolean(
    (process.env.WMS_SERVICE_REFRESH_TOKEN && (process.env.WMS_IAM_BASE_URL || config.iam.baseUrl)) ||
    process.env.WMS_SERVICE_AUTHORIZATION
  );
}

function tokenUsable(state: ServiceTokenState | null): boolean {
  return Boolean(state && state.accessToken && state.expiresAt > Date.now() + TOKEN_REFRESH_WINDOW_MS);
}

async function renewToken(): Promise<ServiceTokenState | null> {
  const refreshToken = process.env.WMS_SERVICE_REFRESH_TOKEN;
  const iamBaseUrl = process.env.WMS_IAM_BASE_URL || config.iam.baseUrl;

  if (!refreshToken || !iamBaseUrl) {
    return null;
  }

  try {
    const previousBaseUrl = config.iam.baseUrl;
    // Temporarily point the IAM adapter at the configured service IAM base URL
    // so the refresh call hits the intended environment.
    (config.iam as { baseUrl: string }).baseUrl = iamBaseUrl;
    let tokens;
    try {
      tokens = await refreshAccessToken(refreshToken);
    } finally {
      (config.iam as { baseUrl: string }).baseUrl = previousBaseUrl;
    }
    const state: ServiceTokenState = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || refreshToken,
      expiresAt: tokens.expiresAt,
    };
    cachedToken = state;
    logger.info('WMS service token renewed');
    return state;
  } catch (error) {
    cachedToken = null;
    logger.warn('WMS service token renewal failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

function getServiceToken(): Promise<ServiceTokenState | null> {
  // Static pre-issued bearer token takes priority over refresh flow only when
  // a refresh token is not configured (fallback mode).
  if (!process.env.WMS_SERVICE_REFRESH_TOKEN) {
    const auth = process.env.WMS_SERVICE_AUTHORIZATION;
    if (auth) {
      return Promise.resolve({
        accessToken: auth,
        refreshToken: '',
        expiresAt: Infinity,
      });
    }
    return Promise.resolve(null);
  }

  if (tokenUsable(cachedToken)) {
    return Promise.resolve(cachedToken);
  }

  if (!renewPromise) {
    renewPromise = renewToken().finally(() => {
      renewPromise = null;
    });
  }
  return renewPromise;
}

/**
 * Resolve an AuthContext for WMS service calls: prefer a browser session
 * auth context (already attached by sessionMiddleware), otherwise use the
 * configured service credentials. Returns null when neither is available.
 */
export async function resolveWmsAuthContext(sessionAuth: AuthContext | undefined): Promise<AuthContext | null> {
  if (sessionAuth && sessionAuth.token) {
    return sessionAuth;
  }
  if (!isConfigured()) {
    return null;
  }
  const token = await getServiceToken();
  if (!token || !token.accessToken) {
    return null;
  }
  return {
    token: token.accessToken,
    tenantId: process.env.TENANT_ID || config.wms.tenantId || 'LT',
    facilityId: process.env.FACILITY_ID || config.wms.facilityId || 'LT_F14',
    username: 'service',
  };
}

/**
 * Force a token renewal (used to retry a WMS 401/403 once).
 */
export async function forceRenewServiceToken(): Promise<AuthContext | null> {
  cachedToken = null;
  renewPromise = null;
  const token = await getServiceToken();
  if (!token || !token.accessToken) {
    return null;
  }
  return {
    token: token.accessToken,
    tenantId: process.env.TENANT_ID || config.wms.tenantId || 'LT',
    facilityId: process.env.FACILITY_ID || config.wms.facilityId || 'LT_F14',
    username: 'service',
  };
}

export { isConfigured as isServiceAuthConfigured };
