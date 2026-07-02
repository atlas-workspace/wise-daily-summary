import crypto from 'node:crypto';
import { config } from './config';
import type { SessionData } from './types';

const sessions = new Map<string, SessionData>();

// Expired sessions are also deleted lazily on read, but the sweep bounds
// memory when sessions are abandoned and never read again.
const SWEEP_INTERVAL_MS = 60_000;
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (now - session.createdAt > config.session.maxAgeMs) sessions.delete(sid);
  }
}, SWEEP_INTERVAL_MS);
sweepTimer.unref();

export function createSessionId(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function signSessionId(sid: string): string {
  const hmac = crypto.createHmac('sha256', config.session.cookieSecret);
  hmac.update(sid);
  return `${sid}.${hmac.digest('base64url')}`;
}

export function verifySessionId(signedSid: string): string | null {
  const dotIndex = signedSid.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const sid = signedSid.slice(0, dotIndex);
  const expected = signSessionId(sid);

  if (expected.length !== signedSid.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signedSid), Buffer.from(expected))) {
    return null;
  }
  return sid;
}

export function setSession(sid: string, data: SessionData): void {
  sessions.set(sid, data);
}

export function getSession(sid: string): SessionData | undefined {
  const session = sessions.get(sid);
  if (!session) return undefined;

  if (Date.now() - session.createdAt > config.session.maxAgeMs) {
    sessions.delete(sid);
    return undefined;
  }
  return session;
}

export function deleteSession(sid: string): void {
  sessions.delete(sid);
}
