import { Router } from "express";
import type { MeDto, UserGroupsDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { listMyGroupSummaries } from "./userGroups.service.ts";

/**
 * GET /users/me — who the token belongs to (US-01); the app's first call after sign-in.
 * GET /users/me/groups — the home screen's list of groups and the caller's net in each (US-05).
 */
export function userGroupsRouter(db: Db): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const body: MeDto = { id: res.locals.user.id, displayName: res.locals.user.displayName };
    res.json(body);
  });

  router.get("/groups", async (_req, res) => {
    const body: UserGroupsDto = { groups: await listMyGroupSummaries(db, res.locals.user.id) };
    res.json(body);
  });

  return router;
}
