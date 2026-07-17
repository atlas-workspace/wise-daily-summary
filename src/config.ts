import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  isProduction,

  iam: {
    baseUrl: process.env.IAM_BASE_URL || 'https://unis.item.com/api/wms-bam',
    loginPath: process.env.IAM_LOGIN_PATH || '/auth/login-by-password',
  },

  session: {
    cookieName: 'wms_sid',
    cookieSecret: process.env.COOKIE_SECRET || 'dev-secret-change-me',
    maxAgeMs: 8 * 60 * 60 * 1000,
  },

  login: {
    // Fixed-window rate limit for POST /api/auth/login, per client IP.
    rateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
    rateLimitWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  },

  wms: {
    baseUrl: process.env.WMS_BASE_URL || 'https://unis.item.com/api',
    authToken: process.env.WMS_AUTH_TOKEN || '',
    tenantId: process.env.TENANT_ID || 'LT',
    facilityId: process.env.FACILITY_ID || 'LT_F14',
  },

  yms: {
    baseUrl: process.env.YMS_BASE_URL || 'https://unis.item.com/api',
  },

  tms: {
    baseUrl: process.env.TMS_BASE_URL || 'https://unis.item.com/api',
    healthPath: process.env.TMS_HEALTH_PATH || '/wms-bam/v1/web/user/info',
  },

  ticket: {
    // Ticket /v1/iam/... endpoints authenticate via the same IAM bearer token
    // stored in the user session. No separate API key is needed or accepted.
    // See: Ticket Ontology — GET /v1/iam/ticket/priorities/list (internal, level2)
    baseUrl: process.env.TICKET_BASE_URL || 'https://ticket.item.com/api/item-tickets',
  },

  timezone: process.env.TIMEZONE || 'America/Los_Angeles',

  poller: {
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
    pageSize: parseInt(process.env.POLL_PAGE_SIZE || '50', 10),
  },

  ws: {
    // Shared key for non-browser WebSocket consumers (query ?key=... or
    // Authorization: Bearer ...). Browser clients authenticate with the
    // session cookie instead. Leave blank to allow session-cookie auth only.
    authKey: process.env.WS_AUTH_KEY || '',
  },

  // POST /simulate/order-shipped broadcasts fake events to all WS clients,
  // so it is disabled in production unless explicitly re-enabled.
  enableSimulateRoute: process.env.ENABLE_SIMULATE_ROUTES !== undefined
    ? process.env.ENABLE_SIMULATE_ROUTES === 'true'
    : !isProduction,

  authDebugResponses: process.env.AUTH_DEBUG_RESPONSES === 'true',
  mockWms: process.env.MOCK_WMS === 'true',
  markEventsProcessed: process.env.MARK_EVENTS_PROCESSED === 'true',
};

if (config.isProduction) {
  if (!process.env.COOKIE_SECRET ||
      config.session.cookieSecret === 'dev-secret-change-me' ||
      config.session.cookieSecret.length < 32) {
    throw new Error(
      'COOKIE_SECRET must be set to a random string of at least 32 characters when NODE_ENV=production'
    );
  }
}
