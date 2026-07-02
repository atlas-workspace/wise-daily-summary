import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  iam: {
    baseUrl: process.env.IAM_BASE_URL || 'https://unis.item.com/api/wms-bam',
    loginPath: process.env.IAM_LOGIN_PATH || '/auth/login-by-password',
  },

  session: {
    cookieName: 'wms_sid',
    cookieSecret: process.env.COOKIE_SECRET || 'dev-secret-change-me',
    maxAgeMs: 8 * 60 * 60 * 1000,
  },

  wms: {
    baseUrl: process.env.WMS_BASE_URL || 'https://unis.item.com/api',
    authToken: process.env.WMS_AUTH_TOKEN || '',
    tenantId: process.env.TENANT_ID || 'LT',
    facilityId: process.env.FACILITY_ID || 'LT_ORG-8125',
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

  authDebugResponses: process.env.AUTH_DEBUG_RESPONSES !== 'false',
  mockWms: process.env.MOCK_WMS === 'true',
  markEventsProcessed: process.env.MARK_EVENTS_PROCESSED === 'true',
};
