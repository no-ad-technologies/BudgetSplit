import { Router } from "express";
import { IDEMPOTENCY_HEADER, type CreateExpenseResponse, type ExpenseListDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { getGroupBalances } from "../balances/balances.service.ts";
import { CreateExpenseBody, IdempotencyKey, ListExpensesQuery } from "./expenses.schema.ts";
import { createEvenExpense, listExpenses } from "./expenses.service.ts";

/** /groups/:groupId/expenses — US-03. Mounted behind devAuth + requireGroupMember. */
export function expensesRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get("/expenses", async (req, res) => {
    const { limit } = ListExpensesQuery.parse(req.query);
    const body: ExpenseListDto = { expenses: await listExpenses(db, res.locals.groupId, limit) };
    res.json(body);
  });

  router.post("/expenses", async (req, res) => {
    const input = CreateExpenseBody.parse(req.body);
    const idempotencyKey = IdempotencyKey.parse(req.header(IDEMPOTENCY_HEADER));
    const groupId = res.locals.groupId;

    const { expense, replayed } = await createEvenExpense(db, {
      groupId,
      actorId: res.locals.user.id,
      input,
      idempotencyKey,
    });

    // Return fresh balances with the expense so the client can redraw in one round trip.
    const body: CreateExpenseResponse = { expense, balances: await getGroupBalances(db, groupId), replayed };
    res.status(replayed ? 200 : 201).json(body);
  });

  return router;
}
