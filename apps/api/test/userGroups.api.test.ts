/**
 * Integration tests for GET /users/me/groups (US-05 home screen, added in PR #14 without tests).
 * Written before refactoring userGroups.routes.ts so the refactor is provably behavior-preserving:
 * these tests passed against the old copy-pasted code and must still pass after it reuses
 * getGroupBalances (docs/refactoring-log.md, entry 3).
 */
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorCode, DEMO_GROUP, DEMO_USERS, DEV_USER_HEADER, type UserGroupsDto } from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";
import { createExpense } from "../src/modules/expenses/expenses.service.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const { maya, josh, riley } = DEMO_USERS;
const TRIP = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Austin Trip" };

describe.skipIf(!databaseUrl)("GET /users/me/groups (US-05 home screen)", () => {
  const db = createDb(databaseUrl!);
  const app = createApp({ db });
  const as = (userId: string) => ({ [DEV_USER_HEADER]: userId });

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
    // A second group that Maya joined after Maple St House, shared with Riley (not in the demo group).
    await db.group.create({ data: { id: TRIP.id, name: TRIP.name } });
    await db.groupMember.createMany({
      data: [
        { groupId: TRIP.id, userId: riley.id, role: "ADMIN", joinedAt: new Date(Date.UTC(2026, 9, 1)) },
        { groupId: TRIP.id, userId: maya.id, joinedAt: new Date(Date.UTC(2026, 9, 2)) },
      ],
    });
    await createExpense(db, {
      groupId: TRIP.id,
      actorId: riley.id,
      input: { description: "Gas", amountCents: 3001, paidById: riley.id, split: { type: "EVEN" } },
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("lists every group the user is in, in the order they joined, with their own net", async () => {
    const res = await request(app).get("/users/me/groups").set(as(maya.id));
    expect(res.status).toBe(200);
    const body = res.body as UserGroupsDto;
    // Maple St House: seeded WiFi + Groceries -> Maya +$33.72. Trip: Riley paid $30.01, split 2 ways,
    // Riley joined first so gets the leftover cent (1501), Maya owes 1500.
    expect(body.groups).toEqual([
      { groupId: DEMO_GROUP.id, groupName: DEMO_GROUP.name, netCents: 3372 },
      { groupId: TRIP.id, groupName: TRIP.name, netCents: -1500 },
    ]);
  });

  it("matches the per-group balances endpoint exactly", async () => {
    const home = (await request(app).get("/users/me/groups").set(as(josh.id))).body as UserGroupsDto;
    const group = await request(app).get(`/groups/${DEMO_GROUP.id}/balances`).set(as(josh.id));
    const joshNet = group.body.balances.find((b: { userId: string }) => b.userId === josh.id).netCents;
    expect(home.groups).toEqual([{ groupId: DEMO_GROUP.id, groupName: DEMO_GROUP.name, netCents: joshNet }]);
  });

  it("shows only the groups the user belongs to (tenant isolation)", async () => {
    const res = await request(app).get("/users/me/groups").set(as(riley.id));
    expect(res.status).toBe(200);
    expect((res.body as UserGroupsDto).groups.map((g) => g.groupName)).toEqual([TRIP.name]);
  });

  it("returns an empty list for a user with no groups", async () => {
    const loner = await db.user.create({ data: { displayName: "Lee" } });
    const res = await request(app).get("/users/me/groups").set(as(loner.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groups: [] });
  });

  it("requires a signed-in user (401)", async () => {
    const res = await request(app).get("/users/me/groups");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ApiErrorCode.unauthenticated);
  });
});
