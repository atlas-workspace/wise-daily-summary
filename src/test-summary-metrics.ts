import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

const capturedRequests: CapturedRequest[] = [];
let upstreamServer: Server;
let upstreamPort = 0;
let appServer: Server;
let appPort = 0;
let expectedRange: { from: string; to: string };
let rejectWmsRequests = false;

function respondJson(res: ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of req) raw += chunk.toString();
  if (!raw) return {};
  return JSON.parse(raw);
}

before(async () => {
  upstreamServer = createServer(async (req, res) => {
    const body = await readBody(req);
    capturedRequests.push({
      url: req.url || '',
      method: req.method || 'GET',
      headers: req.headers,
      body,
    });

    if (req.url === '/auth/exchange-token') {
      respondJson(res, { code: 0, data: { access_token: 'short-lived-token', refresh_token: 'refresh-token', expires_in: 1 } });
      return;
    }
    if (req.url?.startsWith('/auth/token/refresh')) {
      respondJson(res, { code: 0, data: { access_token: 'refreshed-token', refresh_token: 'next-refresh-token', expires_in: 3600 } });
      return;
    }
    if (req.url?.includes('/search-by-paging')) {
      if (rejectWmsRequests) {
        respondJson(res, { code: 401, message: 'Token expired' }, 401);
        return;
      }
      respondJson(res, { code: 0, success: true, data: { totalCount: 0, list: [] } });
      return;
    }
    respondJson(res, { code: 0, success: true, data: {} });
  });

  await new Promise<void>((resolve) => {
    upstreamServer.listen(0, '127.0.0.1', () => {
      const address = upstreamServer.address();
      upstreamPort = typeof address === 'object' && address ? address.port : 0;
      resolve();
    });
  });

  const upstreamBaseUrl = `http://127.0.0.1:${upstreamPort}`;
  process.env.IAM_BASE_URL = upstreamBaseUrl;
  process.env.WMS_BASE_URL = upstreamBaseUrl;
  process.env.COOKIE_SECRET = 'test-cookie-secret-32chars!!!!!';
  process.env.TENANT_ID = 'LT';
  process.env.FACILITY_ID = 'LT_F14';
  process.env.TIMEZONE = 'America/Los_Angeles';

  const { default: express } = await import('express');
  const { sessionMiddleware } = await import('./auth-middleware');
  const { authRouter } = await import('./auth-routes');
  const { summaryRouter } = await import('./daily-summary-routes');
  const { getTodayRangeLA } = await import('./date-utils');
  expectedRange = getTodayRangeLA();

  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware);
  app.use('/api/auth', authRouter);
  app.use('/api/summary', summaryRouter);

  await new Promise<void>((resolve) => {
    appServer = app.listen(0, '127.0.0.1', () => {
      const address = appServer.address();
      appPort = typeof address === 'object' && address ? address.port : 0;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => appServer.close(() => resolve()));
  await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
});

function appUrl(path: string): string {
  return `http://127.0.0.1:${appPort}${path}`;
}

async function login(): Promise<string> {
  const response = await fetch(appUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operator', password: 'password' }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.match(/wms_sid=([^;]+)/)?.[1];
  assert.ok(cookie);
  return `wms_sid=${cookie}`;
}

describe('WMS summary metrics', () => {
  it('requires authentication and disables caching', async () => {
    const response = await fetch(appUrl('/api/summary/outbound-metrics'));
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  });

  it('refreshes IAM once and sends current LA appointment scope', async () => {
    const cookie = await login();
    capturedRequests.length = 0;

    const outboundResponse = await fetch(appUrl('/api/summary/outbound-metrics'), { headers: { Cookie: cookie } });
    assert.equal(outboundResponse.status, 200);
    const outboundBody = await outboundResponse.json() as any;
    assert.equal(outboundBody.metrics.length, 16);
    assert.equal(outboundBody.metrics[0].status, 'IMPORTED');
    assert.equal(outboundBody.totalCount, 0);
    assert.equal(outboundBody.unavailableStatusCount, 0);
    assert.equal(typeof outboundBody.refreshedAt, 'string');

    const refreshRequests = capturedRequests.filter((request) => request.url.startsWith('/auth/token/refresh'));
    assert.equal(refreshRequests.length, 1);
    assert.match(refreshRequests[0].url, /refreshToken=refresh-token/);

    const outboundRequests = capturedRequests.filter((request) => request.url === '/wms-bam/outbound/order/search-by-paging');
    assert.equal(outboundRequests.length, 16);
    for (const request of outboundRequests) {
      assert.equal(request.headers.authorization, 'Bearer refreshed-token');
      assert.equal(request.headers['x-tenant-id'], 'LT');
      assert.equal(request.headers['x-facility-id'], 'LT_F14');
      assert.equal(request.headers['item-time-zone'], 'America/Los_Angeles');
      assert.equal(request.body.customerId, 'ORG-368074');
      assert.equal(request.body.appointmentTimeFrom, expectedRange.from);
      assert.equal(request.body.appointmentTimeTo, expectedRange.to);
    }

    capturedRequests.length = 0;
    const inboundResponse = await fetch(appUrl('/api/summary/inbound-metrics'), { headers: { Cookie: cookie } });
    assert.equal(inboundResponse.status, 200);
    const inboundBody = await inboundResponse.json() as any;
    assert.equal(inboundBody.metrics.length, 10);
    assert.equal(inboundBody.totalCount, 0);
    assert.equal(inboundBody.unavailableStatusCount, 0);
    assert.equal(typeof inboundBody.refreshedAt, 'string');

    const inboundRequests = capturedRequests.filter((request) => request.url === '/wms-bam/inbound/receipt/search-by-paging');
    assert.equal(inboundRequests.length, 10);
    for (const request of inboundRequests) {
      assert.equal(request.body.customerId, 'ORG-368074');
      assert.equal(request.body.appointmentTimeFrom, expectedRange.from);
      assert.equal(request.body.appointmentTimeTo, expectedRange.to);
    }

    capturedRequests.length = 0;
    const detailResponse = await fetch(appUrl('/api/summary/inbound-receipts/IMPORTED'), { headers: { Cookie: cookie } });
    assert.equal(detailResponse.status, 200);
    const detailRequest = capturedRequests.find((request) => request.url === '/wms-bam/inbound/receipt/search-by-paging');
    assert.ok(detailRequest);
    assert.equal(detailRequest.body.customerId, 'ORG-368074');
    assert.equal(detailRequest.body.pageSize, 50);
    assert.equal(detailRequest.body.appointmentTimeFrom, expectedRange.from);
    assert.equal(detailRequest.body.appointmentTimeTo, expectedRange.to);
  });

  it('returns a session-expired response instead of blank metrics', async () => {
    const cookie = await login();
    rejectWmsRequests = true;
    try {
      const response = await fetch(appUrl('/api/summary/outbound-metrics'), { headers: { Cookie: cookie } });
      assert.equal(response.status, 401);
      const body = await response.json() as any;
      assert.deepEqual(body.metrics, []);
      assert.match(body.error, /Session expired/i);
    } finally {
      rejectWmsRequests = false;
    }
  });
});
