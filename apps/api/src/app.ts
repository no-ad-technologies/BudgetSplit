import express, { type Express } from "express";
import type { Db } from "./db.ts";
import { devAuth, requireGroupMember } from "./http/auth.ts";
import { errorHandler, notFound } from "./http/errors.ts";
import { requestLog } from "./http/requestLog.ts";
import { balancesRouter } from "./modules/balances/balances.routes.ts";
import { expensesRouter } from "./modules/expenses/expenses.routes.ts";
import { groupsRouter } from "./modules/groups/groups.routes.ts";

export interface AppDeps {
  db: Db;
  logRequests?: boolean;
  version?: string;
}

/**
 * Builds the Express app. Dependencies are passed in, so tests run the real app against a test
 * database without starting a server.
 *
 * Request path: HTTP layer (validation, auth) -> module service (business rules) -> Prisma -> Postgres.
 */
export function createApp({ db, logRequests = false, version = "dev" }: AppDeps): Express {
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

  const group = express.Router({ mergeParams: true });
  group.use(groupsRouter(db), balancesRouter(db), expensesRouter(db));
  app.use("/groups/:groupId", devAuth(db), requireGroupMember(db), group);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
