import { Router } from "express";
import type { Db } from "../../db.ts";
import { getGroupBalances } from "./balances.service.ts";

/** GET /groups/:groupId/balances — US-05. Mounted behind devAuth + requireGroupMember. */
export function balancesRouter(db: Db): Router {
  const router = Router({ mergeParams: true });
  router.get("/balances", async (_req, res) => {
    res.json(await getGroupBalances(db, res.locals.groupId));
  });
  return router;
}
