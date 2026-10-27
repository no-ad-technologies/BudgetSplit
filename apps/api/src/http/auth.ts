import type { RequestHandler } from "express";
import { z } from "zod";
import { ApiErrorCode, DEV_USER_HEADER } from "@budgetsplit/shared";
import type { Db } from "../db.ts";
import { HttpError } from "./errors.ts";

export interface AuthUser {
  id: string;
  displayName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user: AuthUser;
      groupId: string;
    }
  }
}

const UserId = z.uuid();

/**
 * DEV-ONLY authentication stub for the walking skeleton.
 * Trusts the X-User-Id header if it names an existing user. US-01 replaces this middleware with
 * Firebase ID-token verification; nothing downstream changes because routes only read res.locals.user.
 */
export function devAuth(db: Db): RequestHandler {
  return async (req, res, next) => {
    const parsed = UserId.safeParse(req.header(DEV_USER_HEADER));
    if (!parsed.success) {
      throw new HttpError(401, ApiErrorCode.unauthenticated, `Send a valid user id in the ${DEV_USER_HEADER} header.`);
    }
    const user = await db.user.findUnique({
      where: { id: parsed.data },
      select: { id: true, displayName: true },
    });
    if (!user) throw new HttpError(401, ApiErrorCode.unauthenticated, "Unknown user.");
    res.locals.user = user;
    next();
  };
}

const GroupId = z.uuid();

/** Authorization: every /groups/:groupId route is visible only to members of that group (multi-tenant isolation). */
export function requireGroupMember(db: Db): RequestHandler {
  return async (req, res, next) => {
    const parsed = GroupId.safeParse(req.params.groupId);
    if (!parsed.success) throw new HttpError(400, ApiErrorCode.invalidGroupId, "Group id must be a UUID.");

    const membership = await db.groupMember.findUnique({
      where: { groupId_userId: { groupId: parsed.data, userId: res.locals.user.id } },
      select: { groupId: true },
    });
    if (!membership) throw new HttpError(403, ApiErrorCode.notAMember, "You are not a member of this group.");

    res.locals.groupId = parsed.data;
    next();
  };
}
