import express, { type Express, type RequestHandler } from "express";
import type { Db } from "./db.ts";
import { devAuth, requireGroupMember } from "./http/auth.ts";
import { errorHandler, notFound } from "./http/errors.ts";
import { perUserRateLimit } from "./http/rateLimit.ts";
import { requestLog } from "./http/requestLog.ts";
import { balancesRouter } from "./modules/balances/balances.routes.ts";
import { expensesRouter } from "./modules/expenses/expenses.routes.ts";
import { createGroupHandler, groupsRouter, invitesRouter } from "./modules/groups/groups.routes.ts";
import { userGroupsRouter } from "./modules/groups/userGroups.routes.ts";
import { settlementsRouter } from "./modules/settlements/settlements.routes.ts";
import { insightsRouter } from "./modules/insights/insights.routes.ts";
import type { InsightsDeps } from "./modules/insights/insights.service.ts";

export interface AppDeps {
  db: Db;
  /**
   * Fills res.locals.user or throws a 401. server.ts passes tokenAuth (Firebase) or devAuth depending on
   * AUTH_MODE; the integration tests leave it out and get the dev stub.
   */
  authenticate?: RequestHandler;
  /**
   * Requests each signed-in user may make per window (threat model: denial of service). server.ts sets it
   * from config; left out, there is no limit, which is what most integration tests want.
   */
  userRateLimit?: { limit: number; windowMs: number };
  logRequests?: boolean;
  version?: string;
  /** The model client and quota behind the AI summary (US-11). Left out, summaries are "unavailable". */
  insights?: InsightsDeps;
}

/**
 * Builds the Express app. Dependencies are passed in, so tests run the real app against a test
 * database without starting a server.
 *
 * Request path: HTTP layer (validation, auth) -> module service (business rules) -> Prisma -> Postgres.
 */
export function createApp(deps: AppDeps): Express {
  const { db, authenticate = devAuth(db), userRateLimit, logRequests = false, version = "dev" } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "10kb" }));
  if (logRequests) app.use(requestLog());

  app.get("/health", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "ok", version });
    } catch {
      res.status(503).json({ status: "degraded", database: "unreachable", version });
    }
  });

  // Every authenticated route: verify who is calling, then count the request against that user.
  const limit: RequestHandler = userRateLimit ? perUserRateLimit(userRateLimit) : (_req, _res, next) => next();
  const signedIn = [authenticate, limit];

  app.use("/users/me", signedIn, userGroupsRouter(db));
  app.use("/invites", signedIn, invitesRouter(db));

  const group = express.Router({ mergeParams: true });
  group.use(groupsRouter(db), balancesRouter(db), expensesRouter(db), settlementsRouter(db), insightsRouter(db, deps.insights));
  // POST /groups (create) must come before the /groups/:groupId membership check.
  app.post("/groups", signedIn, createGroupHandler(db));
  app.use("/groups/:groupId", signedIn, requireGroupMember(db), group);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
