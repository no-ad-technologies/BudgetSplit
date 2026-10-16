import "dotenv/config";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb } from "./db.ts";
import { logger } from "./logger.ts";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const app = createApp({
  db,
  logRequests: config.logRequests,
  version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv, auth: config.authMode }, "listening");
});

// Render sends SIGTERM before replacing an instance; finish in-flight requests, then close the pool.
function shutdown(signal: string) {
  logger.info({ signal }, "shutting_down");
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
