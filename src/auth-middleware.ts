import type { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { refreshAccessToken } from './iam-adapter';
import { logger } from './logger';
import { verifySessionId, getSession, setSession, deleteSession } from './session-store';
import { parseCookies } from './cookies';
import { resolveWmsAuthContext } from './service-auth';
import type { AuthContext, SessionData } from './types';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
      wmsAuth?: AuthContext;
    }
  }
}

const TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000;
const refreshPromises = new Map<string, Promise<SessionData>>();

async function getFreshSession(sid: string, session: SessionData): Promise<SessionData> {
  if (session.tokenExpiresAt > Date.now() + TOKEN_REFRESH_WINDOW_MS) return session;

  let refreshPromise = refreshPromises.get(sid);
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken(session.refreshToken).then((tokens) => {
      const refreshedSession: SessionData = {
        ...session,
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      };
      setSession(sid, refreshedSession);
      return refreshedSession;
    }).finally(() => {
      refreshPromises.delete(sid);
    });
    refreshPromises.set(sid, refreshPromise);
  }

  return refreshPromise;
}

export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const signedSid = cookies[config.session.cookieName];

  if (signedSid) {
    const sid = verifySessionId(signedSid);
    if (sid) {
      const session = getSession(sid);
      if (session) {
        try {
          const freshSession = await getFreshSession(sid, session);
          req.authContext = {
            token: freshSession.token,
            tenantId: freshSession.tenantId,
            facilityId: freshSession.facilityId,
            username: freshSession.username,
          };
        } catch (error) {
          deleteSession(sid);
          logger.warn('IAM session refresh failed', {
            username: session.username,
            error: error instanceof Error ? error.message : 'Unknown refresh error',
          });
        }
      }
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).setHeader('Cache-Control', 'no-store').json({ error: 'Session expired or not authenticated. Please sign in again.' });
    return;
  }
  next();
}

/**
 * Resolve WMS authentication for summary endpoints: prefers the signed-in
 * browser session, falls back to the server-side service account. Attaches
 * the resolved context to req.wmsAuth (may be undefined when neither is
 * available — callers respond with a business-friendly unavailable state).
 */
export async function resolveWmsAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.wmsAuth = (await resolveWmsAuthContext(req.authContext)) ?? undefined;
  next();
}
