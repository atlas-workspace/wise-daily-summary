import { Router } from 'express';
import { config } from './config';
import { logger } from './logger';
import { loginByPassword, IamLoginError } from './iam-adapter';
import { createSessionId, signSessionId, setSession, deleteSession, verifySessionId } from './session-store';
import { requireAuth } from './auth-middleware';
import { parseCookies } from './cookies';
import { createRateLimiter } from './rate-limit';
import type { SessionData } from './types';

function buildSessionCookie(value: string, maxAgeSeconds: number): string {
  const parts = [
    `${config.session.cookieName}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.isProduction) parts.push('Secure');
  return parts.join('; ');
}

const loginRateLimiter = createRateLimiter({
  max: config.login.rateLimitMax,
  windowMs: config.login.rateLimitWindowMs,
  message: 'Too many sign-in attempts. Try again later.',
});

function isIamLoginError(err: unknown): err is IamLoginError {
  return err instanceof Error && 'diagnostics' in err;
}

const router = Router();

router.post('/login', loginRateLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    const token = await loginByPassword(username, password);
    const sid = createSessionId();
    const session: SessionData = {
      token,
      tenantId: config.wms.tenantId,
      facilityId: config.wms.facilityId,
      username,
      createdAt: Date.now(),
    };

    setSession(sid, session);
    const signedSid = signSessionId(sid);

    res.setHeader('Set-Cookie', buildSessionCookie(signedSid, Math.floor(config.session.maxAgeMs / 1000)));
    res.json({ ok: true, username: session.username });
  } catch (err: unknown) {
    if (isIamLoginError(err)) {
      const { diagnostics } = err;
      const userError = err.message || 'Sign-in failed';

      if (config.authDebugResponses) {
        res.status(diagnostics.status >= 400 ? diagnostics.status : 401).json({
          error: userError,
          diagnostics: {
            status: diagnostics.status,
            statusText: diagnostics.statusText,
            url: diagnostics.url,
            upstreamMessage: diagnostics.upstreamMessage,
            upstreamCode: diagnostics.upstreamCode,
            responseKeys: diagnostics.responseKeys,
            responseBody: diagnostics.responseBody,
          },
        });
      } else {
        res.status(diagnostics.status >= 400 ? diagnostics.status : 401).json({
          error: userError,
        });
      }
    } else {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      logger.error('Unexpected login error', { error: message });
      res.status(500).json({ error: 'Sign-in failed due to an internal error' });
    }
  }
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const signedSid = cookies[config.session.cookieName];
  if (signedSid) {
    const sid = verifySessionId(signedSid);
    if (sid) deleteSession(sid);
  }

  res.setHeader('Set-Cookie', buildSessionCookie('', 0));
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    username: req.authContext!.username,
  });
});

export { router as authRouter };
