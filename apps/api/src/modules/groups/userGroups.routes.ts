import { Router } from "express";
import type { Db } from "../../db.ts";
import { computeBalances } from "../balances/compute.ts";
import type { UserGroupsDto } from "@budgetsplit/shared";

export function userGroupsRouter(db: Db): Router {
  const router = Router();

  router.get("/groups", async (_req, res) => {
    const userId = res.locals.user.id;
    const memberships = await db.groupMember.findMany({
      where: { userId },
      orderBy: [{ joinedAt: "asc" }, { groupId: "asc" }],
      include: { group: true },
    });

    const summaries = await Promise.all(
      memberships.map(async (membership) => {
        const [members, paid, shares] = await Promise.all([
          db.groupMember.findMany({
            where: { groupId: membership.groupId },
            orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
            select: { userId: true, user: { select: { displayName: true } } },
          }),
          db.expense.groupBy({
            by: ["paidById"],
            where: { groupId: membership.groupId },
            _sum: { amountCents: true },
          }),
          db.expenseShare.groupBy({
            by: ["userId"],
            where: { expense: { groupId: membership.groupId } },
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
        const myBalance = balances.find((b) => b.userId === userId);
        return {
          groupId: membership.groupId,
          groupName: membership.group.name,
          netCents: myBalance?.netCents ?? 0,
        };
      }),
    );

    const body: UserGroupsDto = { groups: summaries };
    res.json(body);
  });

  return router;
}
