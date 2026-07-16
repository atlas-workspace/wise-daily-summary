import express from 'express';
import path from 'node:path';
import { createServer } from 'http';
import { config } from './config';
import { logger } from './logger';
import { sessionMiddleware, requireAuth } from './auth-middleware';
import { authRouter } from './auth-routes';
import { buildHealthRoutes } from './health-route';
import { summaryRouter } from './daily-summary-routes';
import { initWebSocketHub, getConnectedClientCount } from './websocket-hub';
import { startPoller, getPollerState, simulateOrderShipped } from './poller';

const app = express();
app.use(express.json());
app.use(sessionMiddleware);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRouter);
app.use('/api/summary', summaryRouter);

for (const { path: routePath, handler } of buildHealthRoutes()) {
  app.get(routePath, requireAuth, handler);
}

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
