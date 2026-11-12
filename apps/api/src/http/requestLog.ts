import type { RequestHandler } from "express";
import { logger } from "../logger.ts";

/**
 * The request path as it may be written to the log: no query string, and no invite token.
 * An invite token is a bearer secret (whoever holds it can join the group). The database stores only its
 * hash, so the log must not keep the plain value either (threat model: session hijacking).
 */
export function loggablePath(originalUrl: string): string {
  const path = originalUrl.split("?")[0] ?? "";
  return path.replace(/^\/invites\/[^/]+/, "/invites/[token]");
}

/**
 * One log line per request with its latency. Render keeps these logs, and they are how we
 * measure the responsiveness target (p95 under 300 ms) from the quality-attribute table.
 */
export function requestLog(): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info(
        {
          method: req.method,
          path: loggablePath(req.originalUrl),
          status: res.statusCode,
          ms: Math.round(ms * 10) / 10,
        },
        "request",
      );
    });
    next();
  };
}
