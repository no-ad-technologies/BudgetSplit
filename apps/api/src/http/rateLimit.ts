import type { Request, RequestHandler, Response } from "express";
import { ApiErrorCode } from "@budgetsplit/shared";
import { HttpError } from "./errors.ts";

export interface RateLimitOptions {
  /** Requests allowed per key in each window. */
  limit: number;
  windowMs: number;
  /** Who the request counts against. We key on the signed-in user, which a caller can't forge (see below). */
  key: (req: Request, res: Response) => string;
  now?: () => number;
  /** Upper bound on tracked keys, so the limiter itself can't be used to exhaust memory. */
  maxKeys?: number;
}

interface Window {
  startedAt: number;
  count: number;
}

/**
 * Fixed-window rate limiter held in memory (threat model: denial of service).
 *
 * Why per user and not per IP: Render's proxy appends to X-Forwarded-For without removing what the client
 * sent, so behind it an IP address is either the proxy's (everyone shares one bucket) or whatever the
 * caller claims (no limit at all). A verified user id is the one identity the caller can't choose.
 *
 * Limits: counters live in this process, so they reset on deploy and are per instance. That is correct
 * for our single Render instance; a second instance would need a shared store (Redis).
 */
export function rateLimit({ limit, windowMs, key, now = Date.now, maxKeys = 10_000 }: RateLimitOptions): RequestHandler {
  const windows = new Map<string, Window>();

  const evictExpired = (at: number) => {
    for (const [k, w] of windows) if (at - w.startedAt >= windowMs) windows.delete(k);
    // Still full of live windows: drop the oldest (Maps iterate in insertion order).
    for (const k of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(k);
    }
  };

  return (req, res, next) => {
    const at = now();
    const id = key(req, res);
    let current = windows.get(id);
    if (!current || at - current.startedAt >= windowMs) {
      if (!current && windows.size >= maxKeys) evictExpired(at);
      current = { startedAt: at, count: 0 };
      windows.delete(id);
      windows.set(id, current);
    }

    current.count += 1;
    if (current.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((current.startedAt + windowMs - at) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      throw new HttpError(429, ApiErrorCode.rateLimited, `Too many requests. Try again in ${retryAfter} seconds.`);
    }
    next();
  };
}

/** Counts requests against the authenticated user. Mount it after the authentication middleware. */
export function perUserRateLimit(options: { limit: number; windowMs: number; now?: () => number }): RequestHandler {
  return rateLimit({ ...options, key: (_req, res) => res.locals.user.id });
}
