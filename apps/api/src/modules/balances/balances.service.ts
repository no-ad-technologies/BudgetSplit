import type { BalancesDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { computeBalances } from "./compute.ts";

const sumsBy = <K extends string>(rows: ({ _sum: { amountCents: number | null } } & Record<K, string>)[], key: K) =>
  new Map(rows.map((row) => [row[key], row._sum.amountCents ?? 0]));

/**
 * Reads one group's totals with five indexed queries and turns them into net balances (US-05, US-07).
 * Only CONFIRMED settlements count: a pending one changes nothing until the receiver confirms it.
 * This is the only balance query in the codebase; every screen goes through it.
 */
export async function getGroupBalances(db: Db, groupId: string): Promise<BalancesDto> {
  const confirmed = { groupId, status: "CONFIRMED" } as const;
  const [members, paid, shares, sent, received] = await Promise.all([
    db.groupMember.findMany({
      where: { groupId },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      select: { userId: true, user: { select: { displayName: true } } },
    }),
    db.expense.groupBy({ by: ["paidById"], where: { groupId }, _sum: { amountCents: true } }),
    db.expenseShare.groupBy({ by: ["userId"], where: { expense: { groupId } }, _sum: { shareCents: true } }),
    db.settlement.groupBy({ by: ["fromUserId"], where: confirmed, _sum: { amountCents: true } }),
    db.settlement.groupBy({ by: ["toUserId"], where: confirmed, _sum: { amountCents: true } }),
  ]);

  const balances = computeBalances(
    members.map((m) => ({ userId: m.userId, displayName: m.user.displayName })),
    {
      paid: sumsBy(paid, "paidById"),
      share: new Map(shares.map((row) => [row.userId, row._sum.shareCents ?? 0])),
      sent: sumsBy(sent, "fromUserId"),
      received: sumsBy(received, "toUserId"),
    },
  );
  return { groupId, balances };
}
