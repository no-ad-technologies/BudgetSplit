import type { RequestHandler } from "express";

/**
 * One JSON log line per request with its latency. Render keeps these logs, and they are how we
 * measure the responsiveness target (p95 under 300 ms) from the quality-attribute table.
 */
export function requestLog(): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(
        JSON.stringify({
          msg: "request",
          method: req.method,
          path: req.baseUrl + req.path,
          status: res.statusCode,
          ms: Math.round(ms * 10) / 10,
        }),
      );
    });
    next();
  };
}
