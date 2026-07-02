import type { Request, Response, NextFunction } from 'express';

interface WindowEntry {
  count: number;
  windowStart: number;
}

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  message?: string;
}

/**
 * Fixed-window per-IP rate limiter. In-memory, so limits reset on restart
 * and are per-process — sufficient for this template's single-instance
 * deployment model.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const hits = new Map<string, WindowEntry>();

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.windowStart > options.windowMs) hits.delete(key);
    }
  }, options.windowMs);
  sweep.unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart > options.windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      next();
      return;
    }

    entry.count++;
    if (entry.count > options.max) {
      const retryAfterSec = Math.ceil((entry.windowStart + options.windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: options.message || 'Too many requests. Try again later.' });
      return;
    }
    next();
  };
}
