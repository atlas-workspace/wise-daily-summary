import express from 'express';
import path from 'node:path';
import { createServer } from 'http';
import { config } from './config';
import { logger } from './logger';
import { sessionMiddleware, requireAuth } from './auth-middleware';
import { authRouter } from './auth-routes';
import { initWebSocketHub, getConnectedClientCount } from './websocket-hub';
import { startPoller, getPollerState, simulateOrderShipped } from './poller';

const app = express();
app.use(express.json());
app.use(sessionMiddleware);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRouter);

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
      const text = await wmsRes.text().catch(() => '');
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* not json */ }

      const summary = 'WMS access could not be verified';
      logger.warn('WMS health check failed', { status: wmsRes.status, statusText: wmsRes.statusText });

      if (config.authDebugResponses) {
        res.status(200).json({
          ok: false,
          message: summary,
          diagnostics: {
            status: wmsRes.status,
            statusText: wmsRes.statusText,
            upstreamMessage: parsed?.msg || parsed?.message || undefined,
            upstreamCode: parsed?.code !== undefined ? String(parsed.code) : undefined,
          },
        });
      } else {
        res.status(200).json({ ok: false, message: summary });
      }
      return;
    }

    logger.info('WMS health check passed');
    res.json({ ok: true, message: 'WMS connection verified' });
  } catch (err: any) {
    logger.error('WMS health check connection error', { error: err.message });
    const summary = 'Could not reach WMS service';
    if (config.authDebugResponses) {
      res.status(200).json({
        ok: false,
        message: summary,
        diagnostics: { error: err.message },
      });
    } else {
      res.status(200).json({ ok: false, message: summary });
    }
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
      const text = await ymsRes.text().catch(() => '');
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* not json */ }

      const summary = 'YMS access could not be verified';
      logger.warn('YMS health check failed', { status: ymsRes.status, statusText: ymsRes.statusText });

      if (config.authDebugResponses) {
        res.status(200).json({
          ok: false,
          message: summary,
          diagnostics: {
            status: ymsRes.status,
            statusText: ymsRes.statusText,
            upstreamMessage: parsed?.msg || parsed?.message || undefined,
            upstreamCode: parsed?.code !== undefined ? String(parsed.code) : undefined,
          },
        });
      } else {
        res.status(200).json({ ok: false, message: summary });
      }
      return;
    }

    logger.info('YMS health check passed');
    res.json({ ok: true, message: 'YMS connection verified' });
  } catch (err: any) {
    logger.error('YMS health check connection error', { error: err.message });
    const summary = 'Could not reach YMS service';
    if (config.authDebugResponses) {
      res.status(200).json({
        ok: false,
        message: summary,
        diagnostics: { error: err.message },
      });
    } else {
      res.status(200).json({ ok: false, message: summary });
    }
  }
});

app.get('/api/ticket/health', requireAuth, async (req, res) => {
  // Ticket /v1/iam/... endpoints use the same IAM bearer token from the user's
  // authenticated session — no separate API key. Auth contract confirmed via
  // Ticket Ontology: GET /v1/iam/ticket/priorities/list (internal, level2).
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
    try { parsed = text ? JSON.parse(text) : null; } catch { /* not json */ }

    const isHealthy = ticketRes.ok &&
      parsed && typeof parsed === 'object' &&
      parsed.success === true &&
      parsed.code === 200;

    if (!isHealthy) {
      const summary = 'Ticket access could not be verified';
      logger.warn('Ticket health check failed', {
        status: ticketRes.status,
        statusText: ticketRes.statusText,
        upstreamCode: parsed?.code,
      });

      if (config.authDebugResponses) {
        res.status(200).json({
          ok: false,
          message: summary,
          diagnostics: {
            status: ticketRes.status,
            statusText: ticketRes.statusText,
            upstreamMessage: parsed?.msg || parsed?.message || undefined,
            upstreamCode: parsed?.code !== undefined ? String(parsed.code) : undefined,
          },
        });
      } else {
        res.status(200).json({ ok: false, message: summary });
      }
      return;
    }

    logger.info('Ticket health check passed');
    res.json({ ok: true, message: 'Ticket connection verified' });
  } catch (err: any) {
    logger.error('Ticket health check connection error', { error: err.message });
    const summary = 'Could not reach Ticket service';
    if (config.authDebugResponses) {
      res.status(200).json({
        ok: false,
        message: summary,
        diagnostics: { error: err.message },
      });
    } else {
      res.status(200).json({ ok: false, message: summary });
    }
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

    const text = await tmsRes.text().catch(() => '');
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* not json */ }

    const appLevelFailed = parsed && typeof parsed === 'object' && (
      parsed.success === false ||
      (typeof parsed.code === 'number' && parsed.code !== 0 && parsed.code !== 200)
    );

    if (!tmsRes.ok || appLevelFailed) {
      const summary = 'TMS/FMS access could not be verified';
      logger.warn('TMS/FMS health check failed', {
        status: tmsRes.status,
        statusText: tmsRes.statusText,
        upstreamCode: parsed?.code,
      });

      if (config.authDebugResponses) {
        res.status(200).json({
          ok: false,
          message: summary,
          diagnostics: {
            status: tmsRes.status,
            statusText: tmsRes.statusText,
            upstreamMessage: parsed?.msg || parsed?.message || undefined,
            upstreamCode: parsed?.code !== undefined ? String(parsed.code) : undefined,
          },
        });
      } else {
        res.status(200).json({ ok: false, message: summary });
      }
      return;
    }

    logger.info('TMS/FMS health check passed');
    res.json({ ok: true, message: 'TMS/FMS connection verified' });
  } catch (err: any) {
    logger.error('TMS/FMS health check connection error', { error: err.message });
    const summary = 'Could not reach TMS/FMS service';
    if (config.authDebugResponses) {
      res.status(200).json({
        ok: false,
        message: summary,
        diagnostics: { error: err.message },
      });
    } else {
      res.status(200).json({ ok: false, message: summary });
    }
  }
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connectedClients: getConnectedClientCount(),
    poller: getPollerState(),
  });
});

// Broadcasts fake events to every WS client, so it is only registered
// outside production (or when ENABLE_SIMULATE_ROUTES=true).
if (config.enableSimulateRoute) {
  app.post('/simulate/order-shipped', (req, res) => {
    const { orderId } = req.body || {};
    const message = simulateOrderShipped(orderId);
    res.json({ success: true, event: message });
  });
  logger.warn('Simulation route enabled: POST /simulate/order-shipped');
}

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = createServer(app);
initWebSocketHub(server);

server.listen(config.port, '0.0.0.0', () => {
  logger.info(`Server listening on 0.0.0.0:${config.port}`);
  logger.info(`Frontend: http://localhost:${config.port}`);
  logger.info(`WebSocket: ws://localhost:${config.port}/ws`);
  logger.info(`Health: http://localhost:${config.port}/health`);
  startPoller();
});
