import { Router } from "express";
import { z } from "zod";
import type { FairnessSummaryDto, SummaryWindowDays } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { createInsightsService, type InsightsDeps } from "./insights.service.ts";

/** ?days=30 (default) or ?days=90. Anything else is a 400. */
const SummaryQuery = z.object({ days: z.enum(["30", "90"]).default("30") });

/**
 * GET /groups/:groupId/summary (US-11): contribution numbers for the last 30 or 90 days, plus a short
 * neutral summary written by the model when one is available. Mounted behind authentication, the per-user
 * rate limit and requireGroupMember, so only members of the group can ask.
 */
export function insightsRouter(db: Db, deps: InsightsDeps = { llm: null }): Router {
  const router = Router({ mergeParams: true });
  const service = createInsightsService(db, deps);

  router.get("/summary", async (req, res) => {
    const days = Number(SummaryQuery.parse(req.query).days) as SummaryWindowDays;
    const body: FairnessSummaryDto = await service.getSummary(res.locals.groupId, res.locals.user.id, days);
    res.json(body);
  });

  return router;
}
