import { config } from './config';
import { logger } from './logger';
import { searchStatusChangeEvents, markEventProcessed, OrderStatusChangeEvent } from './wms-client';
import { broadcast, StatusChangeMessage } from './websocket-hub';
import type { AuthContext } from './types';

const seenEventIds = new Set<string>();
const MAX_SEEN_EVENT_IDS = 5000;
const MAX_POLL_DELAY_MS = 5 * 60_000;

let pollerTimer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> | null = null;
let pollerRunning = false;
let isPolling = false;
let lastPollTime: string | null = null;
let pollErrorCount = 0;
let pollerAuthContext: AuthContext | undefined;

// Bounded dedup memory: Sets iterate in insertion order, so trimming from
// the front evicts the oldest event ids first.
function rememberEventId(id: string): void {
  seenEventIds.add(id);
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    for (const oldest of seenEventIds) {
      seenEventIds.delete(oldest);
      if (seenEventIds.size <= MAX_SEEN_EVENT_IDS) break;
    }
  }
}

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
      rememberEventId(event.id);
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

  rememberEventId(eventId);
  const message = buildMessage(event);
  broadcast(message);
  lastPollTime = new Date().toISOString();
  logger.info(`[MOCK] Generated sample LOADING→SHIPPED event ${eventId}`);
}

// setTimeout chain instead of setInterval so consecutive failures back off
// exponentially (capped at MAX_POLL_DELAY_MS) instead of hammering the
// gateway at full rate.
async function runPollLoop(): Promise<void> {
  await pollOnce();
  if (!pollerRunning) return;

  const backoffExponent = Math.min(pollErrorCount, 6);
  const delay = Math.min(config.poller.intervalMs * 2 ** backoffExponent, MAX_POLL_DELAY_MS);
  if (pollErrorCount > 0) {
    logger.warn(`Poller backing off after ${pollErrorCount} consecutive error(s); next poll in ${delay}ms`);
  }
  pollerTimer = setTimeout(runPollLoop, delay);
}

export function startPoller(auth?: AuthContext): void {
  if (pollerRunning) return;
  pollerAuthContext = auth;

  if (config.mockWms) {
    logger.info(`Starting poller in MOCK mode (interval: ${config.poller.intervalMs}ms)`);
    pollerRunning = true;
    pollerTimer = setInterval(mockPoll, config.poller.intervalMs);
    return;
  }

  if (!config.wms.authToken && !auth?.token) {
    logger.warn('Poller not started: WMS_AUTH_TOKEN is not configured (set MOCK_WMS=true for local testing)');
    return;
  }

  logger.info(`Starting poller in REAL mode (interval: ${config.poller.intervalMs}ms)`);
  pollerRunning = true;
  void runPollLoop();
}

export function stopPoller(): void {
  pollerRunning = false;
  if (pollerTimer) {
    clearInterval(pollerTimer as ReturnType<typeof setInterval>);
    pollerTimer = null;
    logger.info('Poller stopped');
  }
}

export function getPollerState() {
  return {
    running: pollerRunning,
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

  rememberEventId(eventId);
  broadcast(message);
  return message;
}
