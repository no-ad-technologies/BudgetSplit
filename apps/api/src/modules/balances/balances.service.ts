import type { BalancesDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { computeBalances } from "./compute.ts";

/** Reads one group's totals with three indexed queries and turns them into net balances. */
export async function getGroupBalances(db: Db, groupId: string): Promise<BalancesDto> {
  const [members, paid, shares] = await Promise.all([
    db.groupMember.findMany({
      where: { groupId },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      select: { userId: true, user: { select: { displayName: true } } },
    }),
    db.expense.groupBy({
      by: ["paidById"],
      where: { groupId },
      _sum: { amountCents: true },
    }),
    db.expenseShare.groupBy({
      by: ["userId"],
      where: { expense: { groupId } },
      _sum: { shareCents: true },
    }),
  ]);

  const paidByUser = new Map(paid.map((row) => [row.paidById, row._sum.amountCents ?? 0]));
  const shareByUser = new Map(shares.map((row) => [row.userId, row._sum.shareCents ?? 0]));
  const balances = computeBalances(
    members.map((m) => ({ userId: m.userId, displayName: m.user.displayName })),
    paidByUser,
    shareByUser,
  );
  return { groupId, balances };
}
