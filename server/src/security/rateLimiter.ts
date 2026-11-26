import { NextFunction, Request, Response } from 'express';
import { Socket } from 'socket.io';

export function getClientIp(reqOrSocket: Request | Socket): string {
  const headers =
    'handshake' in reqOrSocket ? reqOrSocket.handshake.headers : reqOrSocket.headers;
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if ('handshake' in reqOrSocket) {
    return reqOrSocket.handshake.address || 'unknown';
  }
  return reqOrSocket.ip || reqOrSocket.socket.remoteAddress || 'unknown';
}

/**
 * In-memory sliding-window HTTP rate limiter (per IP).
 */
export function createHttpRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const { windowMs, maxRequests } = options;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  // Periodically prune expired IP buckets to keep memory bounded
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of buckets.entries()) {
      if (now >= entry.resetAt) {
        buckets.delete(ip);
      }
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Never rate-limit Railway healthchecks
    if (req.path === '/api/health') {
      next();
      return;
    }

    const ip = getClientIp(req);
    const now = Date.now();
    const existing = buckets.get(ip);

    if (!existing || now >= existing.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
      });
      return;
    }

    next();
  };
}

/**
 * Tracks concurrent Socket.io connections per IP to prevent socket flood DDoS.
 */
export class SocketConnectionGuard {
  private ipConnections = new Map<string, number>();
  private readonly maxPerIp: number;

  constructor(maxPerIp = 10) {
    this.maxPerIp = maxPerIp;
  }

  public tryAcquire(socket: Socket): boolean {
    const ip = getClientIp(socket);
    const current = this.ipConnections.get(ip) ?? 0;
    if (current >= this.maxPerIp) {
      return false;
    }
    this.ipConnections.set(ip, current + 1);
    socket.once('disconnect', () => {
      const count = this.ipConnections.get(ip) ?? 1;
      if (count <= 1) {
        this.ipConnections.delete(ip);
      } else {
        this.ipConnections.set(ip, count - 1);
      }
    });
    return true;
  }
}

/**
 * Per-socket event flood protector (e.g., max 140 events/sec to allow 60Hz mouse + actions).
 */
export class SocketEventThrottle {
  private windowStart = Date.now();
  private count = 0;
  private violations = 0;
  private readonly maxEventsPerSec: number;

  constructor(maxEventsPerSec = 140) {
    this.maxEventsPerSec = maxEventsPerSec;
  }

  public allow(): { ok: boolean; shouldDisconnect: boolean } {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    if (this.count > this.maxEventsPerSec) {
      this.violations += 1;
      return { ok: false, shouldDisconnect: this.violations >= 8 };
    }
    return { ok: true, shouldDisconnect: false };
  }
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}
