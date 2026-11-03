/**
 * Feature tests for US-02: create a group and invite roommates with a link.
 * Real app + real Postgres. The acceptance criteria are the first three tests.
 */
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiErrorCode,
  DEMO_GROUP,
  DEMO_USERS,
  DEV_USER_HEADER,
  INVITE_LINK_PREFIX,
  MAX_GROUP_MEMBERS,
  type AcceptInviteResponse,
  type CreatedInviteDto,
  type GroupDto,
  type UserGroupsDto,
} from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";
import { hashInviteToken } from "../src/modules/groups/groups.service.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DAY = 24 * 60 * 60 * 1000;
const { maya, josh, riley } = DEMO_USERS;

describe.skipIf(!databaseUrl)("US-02: create a group and invite roommates", () => {
  const db = createDb(databaseUrl!);
  const app = createApp({ db });
  const as = (userId: string) => ({ [DEV_USER_HEADER]: userId });

  const createGroup = (name: string, userId: string = maya.id) => request(app).post("/groups").set(as(userId)).send({ name });
  const invite = (groupId: string, userId: string = maya.id) =>
    request(app).post(`/groups/${groupId}/invites`).set(as(userId));
  const accept = (token: string, userId: string) => request(app).post(`/invites/${token}/accept`).set(as(userId));

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("Maya creates a group and is its first member and admin", async () => {
    const res = await createGroup("  Road Trip  ");
    expect(res.status).toBe(201);
    const group = res.body as GroupDto;
    expect(group.name).toBe("Road Trip");
    expect(group.members).toEqual([{ userId: maya.id, displayName: "Maya", role: "ADMIN" }]);

    const home = (await request(app).get("/users/me/groups").set(as(maya.id))).body as UserGroupsDto;
    expect(home.groups.map((g) => [g.groupName, g.netCents])).toContainEqual(["Road Trip", 0]);
  });

  it("a roommate who opens the invite link joins and sees the same balances as Maya", async () => {
    const created = (await invite(DEMO_GROUP.id)).body as CreatedInviteDto;
    const res = await accept(created.token, riley.id);

    expect(res.status).toBe(201);
    const body = res.body as AcceptInviteResponse;
    expect(body.joined).toBe(true);
    expect(body.group.members.map((m) => m.displayName)).toEqual(["Maya", "Josh", "Priya", "Sam", "Riley"]);

    const asMaya = await request(app).get(`/groups/${DEMO_GROUP.id}/balances`).set(as(maya.id));
    const asRiley = await request(app).get(`/groups/${DEMO_GROUP.id}/balances`).set(as(riley.id));
    expect(asRiley.status).toBe(200);
    expect(asRiley.body).toEqual(asMaya.body);
    // Joining doesn't re-split old expenses: Riley starts settled up.
    expect(asRiley.body.balances.find((b: { userId: string }) => b.userId === riley.id).netCents).toBe(0);
  });

  it("an invite link expires after 7 days, and the admin can revoke it sooner", async () => {
    const created = (await invite(DEMO_GROUP.id)).body as CreatedInviteDto;
    expect(new Date(created.expiresAt).getTime() - new Date(created.createdAt).getTime()).toBe(7 * DAY);

    // Pretend the invite was made 8 days ago.
    await db.groupInvite.update({
      where: { id: created.id },
      data: { createdAt: new Date(Date.now() - 8 * DAY), expiresAt: new Date(Date.now() - DAY) },
    });
    const expired = await accept(created.token, riley.id);
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe(ApiErrorCode.inviteExpired);

    const fresh = (await invite(DEMO_GROUP.id)).body as CreatedInviteDto;
    expect((await request(app).delete(`/groups/${DEMO_GROUP.id}/invites/${fresh.id}`).set(as(maya.id))).status).toBe(204);
    const revoked = await accept(fresh.token, riley.id);
    expect(revoked.status).toBe(410);
    expect(revoked.body.error.code).toBe(ApiErrorCode.inviteRevoked);
    expect(await db.groupMember.count({ where: { groupId: DEMO_GROUP.id, userId: riley.id } })).toBe(0);
  });

  it("returns the token once as a budgetsplit:// link and stores only its SHA-256 hash", async () => {
    const created = (await invite(DEMO_GROUP.id)).body as CreatedInviteDto;
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(created.url).toBe(`${INVITE_LINK_PREFIX}${created.token}`);

    const stored = await db.groupInvite.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.tokenHash).toBe(hashInviteToken(created.token));
    expect(JSON.stringify(stored)).not.toContain(created.token);

    const list = await request(app).get(`/groups/${DEMO_GROUP.id}/invites`).set(as(maya.id));
    expect(list.body.invites.map((i: { id: string }) => i.id)).toEqual([created.id]);
    expect(JSON.stringify(list.body)).not.toContain(created.token);
  });

  it("joining twice, or six taps at once, adds the member exactly once", async () => {
    const { token } = (await invite(DEMO_GROUP.id)).body as CreatedInviteDto;
    expect((await accept(token, riley.id)).status).toBe(201);
    const again = await accept(token, riley.id);
    expect(again.status).toBe(200);
    expect(again.body.joined).toBe(false);

    // Two requests in a row rarely overlap, so race six at a time, three times. Without the row lock in
    // acceptInvite this fails nearly every round with 500s (unique-key violations); see the D3 report.
    for (let round = 0; round < 3; round++) {
      const user = await db.user.create({ data: { displayName: `Racer ${round}` } });
      const results = await Promise.all(Array.from({ length: 6 }, () => accept(token, user.id)));
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
      expect(await db.groupMember.count({ where: { groupId: DEMO_GROUP.id, userId: user.id } })).toBe(1);
    }
  });

  it("only an admin can create, list or revoke invites (403 for other members)", async () => {
    const { id } = (await invite(DEMO_GROUP.id)).body as CreatedInviteDto;
    for (const res of [
      await invite(DEMO_GROUP.id, josh.id),
      await request(app).get(`/groups/${DEMO_GROUP.id}/invites`).set(as(josh.id)),
      await request(app).delete(`/groups/${DEMO_GROUP.id}/invites/${id}`).set(as(josh.id)),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ApiErrorCode.notGroupAdmin);
    }
    expect((await invite(DEMO_GROUP.id, riley.id)).status).toBe(403); // not even a member
  });

  it("refuses to grow a group past the member limit", async () => {
    const big = (await createGroup("Dorm floor")).body as GroupDto;
    const others = await Promise.all(
      Array.from({ length: MAX_GROUP_MEMBERS - 1 }, (_, i) => db.user.create({ data: { displayName: `Student ${i + 1}` } })),
    );
    await db.groupMember.createMany({ data: others.map((u) => ({ groupId: big.id, userId: u.id })) });

    const { token } = (await invite(big.id)).body as CreatedInviteDto;
    const res = await accept(token, riley.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ApiErrorCode.groupFull);
  });

  it.each([
    ["a blank name", () => createGroup("   "), 400, ApiErrorCode.validationFailed],
    ["a 61-character name", () => createGroup("x".repeat(61)), 400, ApiErrorCode.validationFailed],
    ["no signed-in user", () => request(app).post("/groups").send({ name: "Nope" }), 401, ApiErrorCode.unauthenticated],
    ["an unknown invite", () => accept("A".repeat(24), riley.id), 404, ApiErrorCode.inviteNotFound],
    ["a malformed invite", () => accept("not-a-token", riley.id), 400, ApiErrorCode.validationFailed],
    ["revoking a malformed invite id", () => request(app).delete(`/groups/${DEMO_GROUP.id}/invites/nope`).set(as(maya.id)), 400, ApiErrorCode.invalidInviteId],
  ])("rejects %s", async (_label, send, status, code) => {
    const res = await send();
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it("the database refuses an invite that lasts longer than 7 days", async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO group_invites (id, group_id, token_hash, created_by_id, created_at, expires_at)
         VALUES (gen_random_uuid(), '${DEMO_GROUP.id}', '${"a".repeat(64)}', '${maya.id}', now(), now() + interval '8 days')`,
      ),
    ).rejects.toThrow();
  });
});
