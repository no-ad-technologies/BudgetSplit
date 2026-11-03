import type { GroupSummaryDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { getGroupBalances } from "../balances/balances.service.ts";

/**
 * The signed-in user's groups, in the order they joined, each with their own net balance (US-05 home screen).
 *
 * Reuses getGroupBalances, so the home screen and the group screen can never disagree about a balance:
 * there is one balance query in the codebase, not two copies (docs/refactoring-log.md, entry 3).
 */
export async function listMyGroupSummaries(db: Db, userId: string): Promise<GroupSummaryDto[]> {
  const memberships = await db.groupMember.findMany({
    where: { userId },
    orderBy: [{ joinedAt: "asc" }, { groupId: "asc" }],
    select: { groupId: true, group: { select: { name: true } } },
  });

  return Promise.all(
    memberships.map(async ({ groupId, group }) => {
      const { balances } = await getGroupBalances(db, groupId);
      const mine = balances.find((b) => b.userId === userId);
      return { groupId, groupName: group.name, netCents: mine?.netCents ?? 0 };
    }),
  );
}
