import type { RequestHandler } from "express";
import { logger } from "../logger.ts";

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
          path: req.baseUrl + req.path,
          status: res.statusCode,
          ms: Math.round(ms * 10) / 10,
        },
        "request",
      );
    });
    next();
  };
}
