import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import crypto from 'node:crypto';

// --- Mock upstream before importing app modules ---

let capturedRequests: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
let mockUpstreamHandler: (req: IncomingMessage, res: ServerResponse) => void = defaultUpstreamHandler;

function defaultUpstreamHandler(req: IncomingMessage, res: ServerResponse) {
  capturedRequests.push({
    url: req.url || '',
    method: req.method || 'GET',
    headers: req.headers as Record<string, string>,
  });

  if (req.url?.includes('/auth/login-by-password')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, success: true, data: { accessToken: 'test-iam-token-abc123' } }));
    return;
  }

  // Default healthy response for health check endpoints
  if (req.url?.includes('/v1/iam/ticket/priorities/list')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, code: 200, data: [] }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ code: 0, success: true, data: {} }));
}

let mockUpstream: Server;
let mockUpstreamPort: number;

async function startMockUpstream(): Promise<void> {
  return new Promise((resolve) => {
    mockUpstream = createServer((req, res) => mockUpstreamHandler(req, res));
    mockUpstream.listen(0, '127.0.0.1', () => {
      const addr = mockUpstream.address();
      mockUpstreamPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
}

// --- App setup ---

async function startApp(): Promise<{ port: number; stop: () => Promise<void> }> {
  const baseUrl = `http://127.0.0.1:${mockUpstreamPort}`;

  process.env.PORT = '0';
  process.env.IAM_BASE_URL = `${baseUrl}/wms-bam`;
  process.env.IAM_LOGIN_PATH = '/auth/login-by-password';
  process.env.COOKIE_SECRET = 'test-cookie-secret-32chars!!!!!';
  process.env.WMS_BASE_URL = baseUrl;
  process.env.YMS_BASE_URL = baseUrl;
  process.env.TMS_BASE_URL = baseUrl;
  process.env.TMS_HEALTH_PATH = '/wms-bam/v1/web/user/info';
  process.env.TICKET_BASE_URL = baseUrl;
  process.env.TENANT_ID = 'LT';
  process.env.FACILITY_ID = 'LT_ORG-8125';
  process.env.AUTH_DEBUG_RESPONSES = 'true';
  process.env.MOCK_WMS = 'false';
  process.env.TIMEZONE = 'America/Los_Angeles';
  // Ensure no TICKET_API_KEY leaks in
  delete process.env.TICKET_API_KEY;

  // Dynamic import to pick up env vars
  const { default: express } = await import('express');
  const path = await import('node:path');
  const { config } = await import('./config');
  const { sessionMiddleware, requireAuth } = await import('./auth-middleware');
  const { authRouter } = await import('./auth-routes');

  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware);
  app.use('/api/auth', authRouter);

  // Re-create the health routes with the test config
  app.get('/api/wms/health', requireAuth, async (req, res) => {
    const token = req.authContext!.token;
    const tenantId = req.authContext!.tenantId;
    try {
      const wmsRes = await fetch(`${config.wms.baseUrl}/wms-bam/employee/check-bind-code`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'Content-Type': 'application/json',
        },
      });
      if (!wmsRes.ok) {
        res.status(200).json({ ok: false, message: 'WMS access could not be verified' });
        return;
      }
      res.json({ ok: true, message: 'WMS connection verified' });
    } catch (err: any) {
      res.status(200).json({ ok: false, message: 'Could not reach WMS service' });
    }
  });

  app.get('/api/yms/health', requireAuth, async (req, res) => {
    const token = req.authContext!.token;
    const tenantId = req.authContext!.tenantId;
    const facilityId = req.authContext!.facilityId;
    try {
      const ymsRes = await fetch(`${config.yms.baseUrl}/task-board/employees/filters`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'x-facility-id': facilityId,
          'Item-Time-Zone': config.timezone,
        },
      });
      if (!ymsRes.ok) {
        res.status(200).json({ ok: false, message: 'YMS access could not be verified' });
        return;
      }
      res.json({ ok: true, message: 'YMS connection verified' });
    } catch (err: any) {
      res.status(200).json({ ok: false, message: 'Could not reach YMS service' });
    }
  });

  app.get('/api/tms/health', requireAuth, async (req, res) => {
    const token = req.authContext!.token;
    const tenantId = req.authContext!.tenantId;
    const facilityId = req.authContext!.facilityId;
    try {
      const tmsRes = await fetch(`${config.tms.baseUrl}${config.tms.healthPath}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'x-facility-id': facilityId,
          'Item-Time-Zone': config.timezone,
          'Content-Type': 'application/json',
        },
      });
      if (!tmsRes.ok) {
        res.status(200).json({ ok: false, message: 'TMS/FMS access could not be verified' });
        return;
      }
      res.json({ ok: true, message: 'TMS/FMS connection verified' });
    } catch (err: any) {
      res.status(200).json({ ok: false, message: 'Could not reach TMS/FMS service' });
    }
  });

  app.get('/api/ticket/health', requireAuth, async (req, res) => {
    const token = req.authContext!.token;
    const tenantId = req.authContext!.tenantId;
    try {
      const ticketRes = await fetch(`${config.ticket.baseUrl}/v1/iam/ticket/priorities/list`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': tenantId,
          'User-Agent': 'WISE-Dashboard/1.0',
        },
      });
      const text = await ticketRes.text().catch(() => '');
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      const isHealthy = ticketRes.ok && parsed?.success === true && parsed?.code === 200;
      if (!isHealthy) {
        res.status(200).json({ ok: false, message: 'Ticket access could not be verified' });
        return;
      }
      res.json({ ok: true, message: 'Ticket connection verified' });
    } catch (err: any) {
      res.status(200).json({ ok: false, message: 'Could not reach Ticket service' });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        stop: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

// --- Helpers ---

function cookieSecret(): string {
  return 'test-cookie-secret-32chars!!!!!';
}

function signSid(sid: string): string {
  const hmac = crypto.createHmac('sha256', cookieSecret());
  hmac.update(sid);
  return `${sid}.${hmac.digest('base64url')}`;
}

function extractSetCookie(headers: Headers): string | null {
  const raw = headers.get('set-cookie');
  if (!raw) return null;
  const match = raw.match(/wms_sid=([^;]+)/);
  return match ? match[1] : null;
}

// --- Tests ---

describe('Auth & Health Integration', () => {
  let appPort: number;
  let stopApp: () => Promise<void>;

  before(async () => {
    await startMockUpstream();
    const app = await startApp();
    appPort = app.port;
    stopApp = app.stop;
  });

  after(async () => {
    await stopApp();
    await new Promise<void>((r) => mockUpstream.close(() => r()));
  });

  beforeEach(() => {
    capturedRequests = [];
    mockUpstreamHandler = defaultUpstreamHandler;
  });

  function url(path: string): string {
    return `http://127.0.0.1:${appPort}${path}`;
  }

  describe('Token extraction from IAM login', () => {
    it('extracts accessToken from data.accessToken in login response', async () => {
      const res = await fetch(url('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.ok, true);
      assert.equal(body.username, 'testuser');

      const loginReq = capturedRequests.find(r => r.url?.includes('/auth/login-by-password'));
      assert.ok(loginReq, 'Login request was forwarded to IAM');
    });

    it('returns error when IAM returns no token', async () => {
      mockUpstreamHandler = (req, res) => {
        capturedRequests.push({ url: req.url || '', method: req.method || '', headers: req.headers as any });
        if (req.url?.includes('/auth/login-by-password')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ code: 0, data: { foo: 'bar' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      };

      const res = await fetch(url('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'notoken', password: 'pass' }),
      });
      assert.ok(res.status >= 400 || res.status === 500);
    });
  });

  describe('Signed session cookie', () => {
    it('sets HttpOnly SameSite=Strict cookie on successful login', async () => {
      const res = await fetch(url('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
        redirect: 'manual',
      });
      const setCookie = res.headers.get('set-cookie') || '';
      assert.ok(setCookie.includes('wms_sid='), 'Cookie name is wms_sid');
      assert.ok(setCookie.includes('HttpOnly'), 'Cookie is HttpOnly');
      assert.ok(setCookie.includes('SameSite=Strict'), 'Cookie is SameSite=Strict');
    });

    it('cookie value contains HMAC signature (dot-separated)', async () => {
      const res = await fetch(url('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
        redirect: 'manual',
      });
      const signedSid = extractSetCookie(res.headers);
      assert.ok(signedSid, 'Cookie value present');
      assert.ok(signedSid!.includes('.'), 'Signed SID contains dot separator');
      const [sid, sig] = signedSid!.split('.');
      assert.ok(sid.length >= 48, 'SID is at least 24 random bytes hex-encoded');
      assert.ok(sig.length > 0, 'Signature portion exists');
    });

    it('rejects forged session cookie', async () => {
      const forgedSid = crypto.randomBytes(24).toString('hex');
      const forgedSigned = `${forgedSid}.invalid-signature`;

      const res = await fetch(url('/api/wms/health'), {
        headers: { 'Cookie': `wms_sid=${forgedSigned}` },
      });
      assert.equal(res.status, 401);
    });
  });

  describe('Unauthenticated rejection', () => {
    it('returns 401 for /api/wms/health without session', async () => {
      const res = await fetch(url('/api/wms/health'));
      assert.equal(res.status, 401);
      const body = await res.json() as any;
      assert.equal(body.error, 'Not authenticated');
    });

    it('returns 401 for /api/yms/health without session', async () => {
      const res = await fetch(url('/api/yms/health'));
      assert.equal(res.status, 401);
    });

    it('returns 401 for /api/tms/health without session', async () => {
      const res = await fetch(url('/api/tms/health'));
      assert.equal(res.status, 401);
    });

    it('returns 401 for /api/ticket/health without session', async () => {
      const res = await fetch(url('/api/ticket/health'));
      assert.equal(res.status, 401);
    });
  });

  describe('Health endpoints forward IAM bearer token', () => {
    let sessionCookie: string;

    before(async () => {
      capturedRequests = [];
      mockUpstreamHandler = defaultUpstreamHandler;
      const loginRes = await fetch(url('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'healthuser', password: 'pass' }),
        redirect: 'manual',
      });
      const setCookie = loginRes.headers.get('set-cookie') || '';
      const match = setCookie.match(/wms_sid=([^;]+)/);
      sessionCookie = match ? `wms_sid=${match[1]}` : '';
      assert.ok(sessionCookie, 'Got session cookie for health tests');
      capturedRequests = [];
    });

    it('WMS health forwards Authorization: Bearer <IAM token>', async () => {
      const res = await fetch(url('/api/wms/health'), { headers: { 'Cookie': sessionCookie } });
      assert.equal(res.status, 200);
      const wmsReq = capturedRequests.find(r => r.url?.includes('/wms-bam/employee/check-bind-code'));
      assert.ok(wmsReq, 'WMS health request forwarded');
      assert.equal(wmsReq!.headers['authorization'], 'Bearer test-iam-token-abc123');
      assert.equal(wmsReq!.headers['x-tenant-id'], 'LT');
    });

    it('YMS health forwards Authorization: Bearer <IAM token>', async () => {
      const res = await fetch(url('/api/yms/health'), { headers: { 'Cookie': sessionCookie } });
      assert.equal(res.status, 200);
      const ymsReq = capturedRequests.find(r => r.url?.includes('/task-board/employees/filters'));
      assert.ok(ymsReq, 'YMS health request forwarded');
      assert.equal(ymsReq!.headers['authorization'], 'Bearer test-iam-token-abc123');
      assert.equal(ymsReq!.headers['x-tenant-id'], 'LT');
      assert.equal(ymsReq!.headers['x-facility-id'], 'LT_ORG-8125');
    });

    it('TMS health forwards Authorization: Bearer <IAM token>', async () => {
      const res = await fetch(url('/api/tms/health'), { headers: { 'Cookie': sessionCookie } });
      assert.equal(res.status, 200);
      const tmsReq = capturedRequests.find(r => r.url?.includes('/wms-bam/v1/web/user/info'));
      assert.ok(tmsReq, 'TMS health request forwarded');
      assert.equal(tmsReq!.headers['authorization'], 'Bearer test-iam-token-abc123');
      assert.equal(tmsReq!.headers['x-tenant-id'], 'LT');
    });

    it('Ticket health forwards Authorization: Bearer <IAM token> and x-tenant-id', async () => {
      const res = await fetch(url('/api/ticket/health'), { headers: { 'Cookie': sessionCookie } });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.ok, true);
      const ticketReq = capturedRequests.find(r => r.url?.includes('/v1/iam/ticket/priorities/list'));
      assert.ok(ticketReq, 'Ticket health request forwarded to /v1/iam/ticket/priorities/list');
      assert.equal(ticketReq!.headers['authorization'], 'Bearer test-iam-token-abc123');
      assert.equal(ticketReq!.headers['x-tenant-id'], 'LT');
    });

    it('Ticket health does NOT send x-api-key header', async () => {
      capturedRequests = [];
      await fetch(url('/api/ticket/health'), { headers: { 'Cookie': sessionCookie } });
      const ticketReq = capturedRequests.find(r => r.url?.includes('/v1/iam/ticket/priorities/list'));
      assert.ok(ticketReq, 'Ticket request captured');
      assert.equal(ticketReq!.headers['x-api-key'], undefined, 'No x-api-key header sent to Ticket endpoint');
    });
  });
});
