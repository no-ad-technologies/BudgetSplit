import { Router } from "express";
import { z } from "zod";
import {
  ApiErrorCode,
  IDEMPOTENCY_HEADER,
  type SettlementListDto,
  type SettlementResponse,
} from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { HttpError } from "../../http/errors.ts";
import { getGroupBalances } from "../balances/balances.service.ts";
import { IdempotencyKey } from "../expenses/expenses.schema.ts";
import { ListSettlementsQuery, RecordSettlementBody, RejectSettlementBody } from "./settlements.schema.ts";
import { getSettleUpPlan, listSettlements, recordSettlement, respondToSettlement } from "./settlements.service.ts";

const SettlementId = z.uuid();

function settlementIdOf(raw: string | undefined): string {
  const parsed = SettlementId.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, ApiErrorCode.invalidSettlementId, "Settlement id must be a UUID.");
  return parsed.data;
}

/**
 * /groups/:groupId/settle-up (US-06) and /groups/:groupId/settlements (US-07).
 * Mounted behind devAuth + requireGroupMember. Every write answers with the balances after it.
 */
export function settlementsRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get("/settle-up", async (_req, res) => {
    res.json(await getSettleUpPlan(db, res.locals.groupId));
  });

  router.get("/settlements", async (req, res) => {
    const options = ListSettlementsQuery.parse(req.query);
    const body: SettlementListDto = { settlements: await listSettlements(db, res.locals.groupId, options) };
    res.json(body);
  });

  router.post("/settlements", async (req, res) => {
    const input = RecordSettlementBody.parse(req.body);
    const idempotencyKey = IdempotencyKey.parse(req.header(IDEMPOTENCY_HEADER));
    const groupId = res.locals.groupId;
    const { settlement, replayed } = await recordSettlement(db, { groupId, actorId: res.locals.user.id, input, idempotencyKey });
    const body: SettlementResponse = { settlement, balances: await getGroupBalances(db, groupId), replayed };
    res.status(replayed ? 200 : 201).json(body);
  });

  router.post("/settlements/:settlementId/confirm", async (req, res) => {
    const groupId = res.locals.groupId;
    const settlement = await respondToSettlement(db, {
      groupId,
      settlementId: settlementIdOf(req.params.settlementId),
      actorId: res.locals.user.id,
      decision: "CONFIRMED",
    });
    const body: SettlementResponse = { settlement, balances: await getGroupBalances(db, groupId) };
    res.json(body);
  });

  router.post("/settlements/:settlementId/reject", async (req, res) => {
    const { reason } = RejectSettlementBody.parse(req.body);
    const groupId = res.locals.groupId;
    const settlement = await respondToSettlement(db, {
      groupId,
      settlementId: settlementIdOf(req.params.settlementId),
      actorId: res.locals.user.id,
      decision: "REJECTED",
      reason,
    });
    const body: SettlementResponse = { settlement, balances: await getGroupBalances(db, groupId) };
    res.json(body);
  });

  return router;
}
