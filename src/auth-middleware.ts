import type { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { verifySessionId, getSession } from './session-store';
import { parseCookies } from './cookies';
import type { AuthContext } from './types';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const signedSid = cookies[config.session.cookieName];

  if (signedSid) {
    const sid = verifySessionId(signedSid);
    if (sid) {
      const session = getSession(sid);
      if (session) {
        req.authContext = {
          token: session.token,
          tenantId: session.tenantId,
          facilityId: session.facilityId,
          username: session.username,
        };
      }
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.authContext) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}
