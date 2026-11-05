import { createHash, randomBytes } from "node:crypto";
import {
  ApiErrorCode,
  INVITE_LINK_PREFIX,
  INVITE_TTL_DAYS,
  MAX_GROUP_MEMBERS,
  type CreatedInviteDto,
  type GroupDto,
  type InviteDto,
} from "@budgetsplit/shared";
import type { Db } from "../../db.ts";
import { HttpError } from "../../http/errors.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** SHA-256 of an invite token. Only the hash is stored; the token is shown to the admin once. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getGroup(db: Db, groupId: string): Promise<GroupDto> {
  const group = await db.group.findUnique({
    where: { id: groupId },
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
  return {
    id: group.id,
    name: group.name,
    members: group.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName, role: m.role })),
  };
}

/** Creates a group with the signed-in user as its first member and admin, in one transaction (US-02). */
export async function createGroup(db: Db, actorId: string, name: string): Promise<GroupDto> {
  const group = await db.group.create({
    data: { name, members: { create: { userId: actorId, role: "ADMIN" } } },
    select: { id: true },
  });
  return getGroup(db, group.id);
}

async function assertAdmin(db: Db, groupId: string, userId: string): Promise<void> {
  const membership = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { role: true },
  });
  if (membership?.role !== "ADMIN") {
    throw new HttpError(403, ApiErrorCode.notGroupAdmin, "Only a group admin can manage invites.");
  }
}

const toInviteDto = (i: { id: string; groupId: string; createdById: string; createdAt: Date; expiresAt: Date }): InviteDto => ({
  id: i.id,
  groupId: i.groupId,
  createdById: i.createdById,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
});

/** A new invite link, valid for 7 days (US-02). Admins only. */
export async function createInvite(db: Db, groupId: string, actorId: string, now = new Date()): Promise<CreatedInviteDto> {
  await assertAdmin(db, groupId, actorId);
  const token = randomBytes(18).toString("base64url");
  const invite = await db.groupInvite.create({
    data: {
      groupId,
      createdById: actorId,
      tokenHash: hashInviteToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS),
    },
  });
  return { ...toInviteDto(invite), token, url: `${INVITE_LINK_PREFIX}${token}` };
}

/** Invites that still work: not revoked and not expired. Admins only. */
export async function listActiveInvites(db: Db, groupId: string, actorId: string, now = new Date()): Promise<InviteDto[]> {
  await assertAdmin(db, groupId, actorId);
  const invites = await db.groupInvite.findMany({
    where: { groupId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  return invites.map(toInviteDto);
}

/** Revokes an invite before it expires (US-02). Admins only; revoking twice is harmless. */
export async function revokeInvite(db: Db, groupId: string, inviteId: string, actorId: string): Promise<void> {
  await assertAdmin(db, groupId, actorId);
  const { count } = await db.groupInvite.updateMany({
    where: { id: inviteId, groupId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0 && !(await db.groupInvite.findFirst({ where: { id: inviteId, groupId }, select: { id: true } }))) {
    throw new HttpError(404, ApiErrorCode.inviteNotFound, "Invite not found in this group.");
  }
}

/**
 * Joins the group behind an invite token (US-02). Joining twice is harmless (joined: false).
 * New members start settled up: existing expenses are not re-split.
 */
export async function acceptInvite(
  db: Db,
  token: string,
  actorId: string,
  now = new Date(),
): Promise<{ group: GroupDto; joined: boolean }> {
  const invite = await db.groupInvite.findUnique({ where: { tokenHash: hashInviteToken(token) } });
  if (!invite) throw new HttpError(404, ApiErrorCode.inviteNotFound, "That invite link doesn't exist.");
  if (invite.revokedAt) throw new HttpError(410, ApiErrorCode.inviteRevoked, "That invite link was revoked. Ask for a new one.");
  if (invite.expiresAt <= now) throw new HttpError(410, ApiErrorCode.inviteExpired, "That invite link has expired. Ask for a new one.");

  // Lock the group row so joins to one group happen one at a time: the member cap and the
  // "already a member" check stay exact even when two people (or two taps) join at once.
  const joined = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM groups WHERE id = ${invite.groupId}::uuid FOR UPDATE`;
    const already = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId: invite.groupId, userId: actorId } },
      select: { userId: true },
    });
    if (already) return false;
    const members = await tx.groupMember.count({ where: { groupId: invite.groupId } });
    if (members >= MAX_GROUP_MEMBERS) {
      throw new HttpError(409, ApiErrorCode.groupFull, `A group can have at most ${MAX_GROUP_MEMBERS} members.`);
    }
    await tx.groupMember.create({ data: { groupId: invite.groupId, userId: actorId, role: "MEMBER" } });
    return true;
  });
  return { group: await getGroup(db, invite.groupId), joined };
}
