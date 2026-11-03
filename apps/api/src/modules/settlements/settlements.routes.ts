import { Router } from "express";
import type { Db } from "../../db.ts";
import { getSettleUpPlan } from "./settlements.service.ts";

/** /groups/:groupId/settle-up — US-06. Mounted behind devAuth + requireGroupMember. */
export function settlementsRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get("/settle-up", async (_req, res) => {
    res.json(await getSettleUpPlan(db, res.locals.groupId));
  });

  return router;
}
