import "dotenv/config";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb } from "./db.ts";
import { devAuth, tokenAuth } from "./http/auth.ts";
import { createFirebaseVerifier } from "./http/tokenVerifier.ts";
import { logger } from "./logger.ts";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const authenticate =
  config.auth.mode === "firebase"
    ? tokenAuth(db, createFirebaseVerifier({ projectId: config.auth.firebaseProjectId }))
    : devAuth(db);
const app = createApp({
  db,
  authenticate,
  userRateLimit: config.userRateLimit,
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
