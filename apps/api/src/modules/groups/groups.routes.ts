import { Router, type RequestHandler } from "express";
import { ApiErrorCode, type AcceptInviteResponse, type CreatedInviteDto, type GroupDto, type InviteListDto } from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { HttpError } from "../../http/errors.ts";
import { CreateGroupBody, InviteId, InviteToken } from "./groups.schema.ts";
import { acceptInvite, createGroup, createInvite, getGroup, listActiveInvites, revokeInvite } from "./groups.service.ts";

/**
 * /groups/:groupId and its invites (US-02). Mounted behind devAuth + requireGroupMember;
 * invite management additionally requires the ADMIN role (checked in the service).
 */
export function groupsRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (_req, res) => {
    const body: GroupDto = await getGroup(db, res.locals.groupId);
    res.json(body);
  });

  router.get("/invites", async (_req, res) => {
    const body: InviteListDto = { invites: await listActiveInvites(db, res.locals.groupId, res.locals.user.id) };
    res.json(body);
  });

  router.post("/invites", async (_req, res) => {
    const body: CreatedInviteDto = await createInvite(db, res.locals.groupId, res.locals.user.id);
    res.status(201).json(body);
  });

  router.delete("/invites/:inviteId", async (req, res) => {
    const parsed = InviteId.safeParse(req.params.inviteId);
    if (!parsed.success) throw new HttpError(400, ApiErrorCode.invalidInviteId, "Invite id must be a UUID.");
    await revokeInvite(db, res.locals.groupId, parsed.data, res.locals.user.id);
    res.status(204).end();
  });

  return router;
}

/** POST /groups: create a group (US-02). Mounted behind devAuth only: you don't need a group to make one. */
export function createGroupHandler(db: Db): RequestHandler {
  return async (req, res) => {
    const { name } = CreateGroupBody.parse(req.body);
    const body: GroupDto = await createGroup(db, res.locals.user.id, name);
    res.status(201).json(body);
  };
}

/** POST /invites/:token/accept: join a group from an invite link (US-02). Mounted behind devAuth. */
export function invitesRouter(db: Db): Router {
  const router = Router();
  router.post("/:token/accept", async (req, res) => {
    const token = InviteToken.parse(req.params.token);
    const result = await acceptInvite(db, token, res.locals.user.id);
    const body: AcceptInviteResponse = result;
    res.status(result.joined ? 201 : 200).json(body);
  });
  return router;
}
