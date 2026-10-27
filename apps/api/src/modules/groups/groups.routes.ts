import { Router } from "express";
import { ApiErrorCode, type GroupDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { HttpError } from "../../http/errors.ts";

/**
 * GET /groups/:groupId — the group and its members in join order.
 * Creating groups and invites is US-02 (MVP); the walking skeleton reads the seeded group.
 */
export function groupsRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (_req, res) => {
    const group = await db.group.findUnique({
      where: { id: res.locals.groupId },
      select: {
        id: true,
        name: true,
        members: {
          orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
          select: { userId: true, role: true, user: { select: { displayName: true } } },
        },
      },
    });
    if (!group) throw new HttpError(404, ApiErrorCode.groupNotFound, "Group not found.");

    const body: GroupDto = {
      id: group.id,
      name: group.name,
      members: group.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName, role: m.role })),
    };
    res.json(body);
  });

  return router;
}
