import { pino } from "pino";

/**
 * One shared structured logger for the API. Replaces hand-written `console.log(JSON.stringify(...))`
 * calls: pino handles levels, timestamps and error serialization (message + stack) for us.
 *
 * Production and test emit newline-delimited JSON for Render's log stream; development pipes through
 * pino-pretty only so a human reading the terminal gets readable lines.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "budgetsplit-api" },
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname,service" } }
      : undefined,
});
