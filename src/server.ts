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

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connectedClients: getConnectedClientCount(),
    poller: getPollerState(),
  });
});

app.post('/simulate/order-shipped', (req, res) => {
  const { orderId } = req.body || {};
  const message = simulateOrderShipped(orderId);
  res.json({ success: true, event: message });
});

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
