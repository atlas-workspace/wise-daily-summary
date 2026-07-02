import { config } from './config';
import { logger } from './logger';
import { searchStatusChangeEvents, markEventProcessed, OrderStatusChangeEvent } from './wms-client';
import { broadcast, StatusChangeMessage } from './websocket-hub';
import type { AuthContext } from './types';

const seenEventIds = new Set<string>();
let pollerTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let lastPollTime: string | null = null;
let pollErrorCount = 0;
let pollerAuthContext: AuthContext | undefined;

function buildMessage(event: OrderStatusChangeEvent): StatusChangeMessage {
  return {
    type: 'order.status.changed',
    orderId: event.orderId,
    oldStatus: event.oldStatus,
    newStatus: event.newStatus,
    eventId: event.id,
    occurredAt: event.createdTime,
    rawEvent: event as unknown as Record<string, unknown>,
  };
}

function isTargetTransition(event: OrderStatusChangeEvent): boolean {
  return event.oldStatus === 'LOADING' && event.newStatus === 'SHIPPED';
}

async function pollOnce(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  try {
    const response = await searchStatusChangeEvents(1, pollerAuthContext);
    lastPollTime = new Date().toISOString();

    const matchingEvents = response.list.filter(
      (event) => isTargetTransition(event) && !seenEventIds.has(event.id)
    );

    for (const event of matchingEvents) {
      seenEventIds.add(event.id);
      const message = buildMessage(event);
      broadcast(message);

      if (config.markEventsProcessed) {
        try {
          await markEventProcessed(event.id, pollerAuthContext);
        } catch (err) {
          logger.error(`Failed to mark event ${event.id} as PROCESSED`, err);
        }
      }
    }

    if (matchingEvents.length > 0) {
      logger.info(`Processed ${matchingEvents.length} LOADING→SHIPPED transition(s)`);
    }

    pollErrorCount = 0;
  } catch (err) {
    pollErrorCount++;
    logger.error(`Poll error (count: ${pollErrorCount})`, err);
  } finally {
    isPolling = false;
  }
}

let mockCounter = 0;

function mockPoll(): void {
  mockCounter++;
  if (mockCounter % 3 !== 0) return; // emit every 3rd tick

  const eventId = `mock-evt-${Date.now()}`;
  const event: OrderStatusChangeEvent = {
    id: eventId,
    orderId: `ORD-MOCK-${Math.floor(Math.random() * 100000)}`,
    oldStatus: 'LOADING',
    newStatus: 'SHIPPED',
    processStatus: 'PENDING',
    createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
  };

  seenEventIds.add(eventId);
  const message = buildMessage(event);
  broadcast(message);
  lastPollTime = new Date().toISOString();
  logger.info(`[MOCK] Generated sample LOADING→SHIPPED event ${eventId}`);
}

export function startPoller(auth?: AuthContext): void {
  if (pollerTimer) return;
  pollerAuthContext = auth;

  if (config.mockWms) {
    logger.info(`Starting poller in MOCK mode (interval: ${config.poller.intervalMs}ms)`);
    pollerTimer = setInterval(mockPoll, config.poller.intervalMs);
  } else {
    logger.info(`Starting poller in REAL mode (interval: ${config.poller.intervalMs}ms)`);
    pollerTimer = setInterval(pollOnce, config.poller.intervalMs);
    pollOnce(); // initial poll immediately
  }
}

export function stopPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    logger.info('Poller stopped');
  }
}

export function getPollerState() {
  return {
    running: pollerTimer !== null,
    mode: config.mockWms ? 'mock' : 'real',
    lastPollTime,
    pollErrorCount,
    seenEventCount: seenEventIds.size,
  };
}

export function simulateOrderShipped(orderId?: string): StatusChangeMessage {
  const eventId = `sim-${Date.now()}`;
  const message: StatusChangeMessage = {
    type: 'order.status.changed',
    orderId: orderId || `ORD-SIM-${Math.floor(Math.random() * 100000)}`,
    oldStatus: 'LOADING',
    newStatus: 'SHIPPED',
    eventId,
    occurredAt: new Date().toISOString(),
    rawEvent: { simulated: true },
  };

  seenEventIds.add(eventId);
  broadcast(message);
  return message;
}
