import type { SettleUpDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { getGroupBalances } from "../balances/balances.service.ts";
import { planSettlement } from "./plan.ts";

/**
 * The group's settle-up plan (US-06), computed fresh from the current balances on every request, so it
 * always reflects the latest expenses and settlements. Balances come in join order, which breaks ties.
 */
export async function getSettleUpPlan(db: Db, groupId: string): Promise<SettleUpDto> {
  const { balances } = await getGroupBalances(db, groupId);
  const names = new Map(balances.map((b) => [b.userId, b.displayName]));
  const plan = planSettlement(balances);
  return {
    groupId,
    exact: plan.exact,
    payments: plan.payments.map((p) => ({
      fromUserId: p.fromUserId,
      fromName: names.get(p.fromUserId)!,
      toUserId: p.toUserId,
      toName: names.get(p.toUserId)!,
      amountCents: p.amountCents,
    })),
  };
}
