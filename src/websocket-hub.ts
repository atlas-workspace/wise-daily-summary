import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { logger } from './logger';

export interface StatusChangeMessage {
  type: 'order.status.changed';
  orderId: string;
  oldStatus: string;
  newStatus: string;
  eventId: string;
  occurredAt: string;
  rawEvent: Record<string, unknown>;
}

interface WelcomeMessage {
  type: 'welcome';
  message: string;
  serverTime: string;
}

let wss: WebSocketServer;

export function initWebSocketHub(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    logger.info(`WebSocket client connected (total: ${wss.clients.size})`);

    const welcome: WelcomeMessage = {
      type: 'welcome',
      message: 'Connected to WMS Order Status Change WebSocket Bridge',
      serverTime: new Date().toISOString(),
    };
    ws.send(JSON.stringify(welcome));

    ws.on('pong', () => {
      (ws as any).__alive = true;
    });

    ws.on('close', () => {
      logger.info(`WebSocket client disconnected (total: ${wss.clients.size})`);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket client error', err.message);
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if ((ws as any).__alive === false) {
        ws.terminate();
        return;
      }
      (ws as any).__alive = false;
      ws.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  logger.info('WebSocket hub initialized on /ws');
  return wss;
}

export function broadcast(message: StatusChangeMessage): number {
  const payload = JSON.stringify(message);
  let sent = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });

  logger.info(`Broadcast event ${message.eventId} to ${sent} client(s)`);
  return sent;
}

export function getConnectedClientCount(): number {
  return wss?.clients.size ?? 0;
}
