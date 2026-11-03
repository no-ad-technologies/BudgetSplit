/**
 * Feature tests for US-04: split an expense by percentage or by custom amounts.
 * Real Express app + real Prisma + real Postgres test database, like the walking-skeleton tests.
 * Row IDs (V4, V6, I9, E1, E2) refer to docs/testing/equivalence-partitioning.md.
 */
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiErrorCode,
  DEMO_GROUP,
  DEMO_USERS,
  DEV_USER_HEADER,
  IDEMPOTENCY_HEADER,
  type CreateExpenseRequest,
  type CreateExpenseResponse,
} from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const GROUP = `/groups/${DEMO_GROUP.id}`;
const { maya, josh, priya, sam, riley } = DEMO_USERS;

describe.skipIf(!databaseUrl)("US-04: split by percentage or custom amounts", () => {
  const db = createDb(databaseUrl!);
  const app = createApp({ db });
  const as = (userId: string) => ({ [DEV_USER_HEADER]: userId });
  const expenseCount = () => db.expense.count({ where: { groupId: DEMO_GROUP.id } });
  const sharesByName = (body: CreateExpenseResponse) => {
    const names = new Map<string, string>(Object.values(DEMO_USERS).map((u) => [u.id, u.displayName]));
    return Object.fromEntries(body.expense.shares.map((s) => [names.get(s.userId), s.shareCents]));
  };
  const post = (body: CreateExpenseRequest, userId: string = maya.id) =>
    request(app).post(`${GROUP}/expenses`).set(as(userId)).send(body);

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("V4 splits rent by percentage, with a member left out at $0.00", async () => {
    // Maya has the big bedroom. Sam is subletting this month and isn't in the rent.
    const res = await post({
      description: "Rent (November)",
      amountCents: 150_000,
      paidById: maya.id,
      split: {
        type: "PERCENT",
        shares: [
          { userId: maya.id, basisPoints: 4000 },
          { userId: josh.id, basisPoints: 3000 },
          { userId: priya.id, basisPoints: 3000 },
        ],
      },
    });

    expect(res.status).toBe(201);
    const body = res.body as CreateExpenseResponse;
    expect(body.expense.splitType).toBe("PERCENT");
    expect(sharesByName(body)).toEqual({ Maya: 60_000, Josh: 45_000, Priya: 45_000, Sam: 0 });
    expect(body.balances.balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);
  });

  it("V6 gives the leftover cent to the first member with a fraction, skipping a 0% member who joined first", async () => {
    const res = await post({
      description: "Pizza",
      amountCents: 999,
      paidById: josh.id,
      split: {
        type: "PERCENT",
        shares: [
          { userId: maya.id, basisPoints: 0 },
          { userId: josh.id, basisPoints: 5000 },
          { userId: priya.id, basisPoints: 5000 },
        ],
      },
    });
    expect(res.status).toBe(201);
    expect(sharesByName(res.body)).toEqual({ Maya: 0, Josh: 500, Priya: 499, Sam: 0 });
  });

  it("E1 records custom amounts and changes balances by exactly those amounts", async () => {
    const before = await request(app).get(`${GROUP}/balances`).set(as(maya.id));
    const res = await post({
      description: "Concert tickets",
      amountCents: 9000,
      paidById: priya.id,
      split: {
        type: "EXACT",
        shares: [
          { userId: maya.id, shareCents: 5000 },
          { userId: josh.id, shareCents: 4000 },
        ],
      },
    });

    expect(res.status).toBe(201);
    const body = res.body as CreateExpenseResponse;
    expect(body.expense.splitType).toBe("EXACT");
    expect(sharesByName(body)).toEqual({ Maya: 5000, Josh: 4000, Priya: 0, Sam: 0 });

    const net = (b: { balances: { userId: string; netCents: number }[] }, id: string) =>
      b.balances.find((x) => x.userId === id)!.netCents;
    expect(net(body.balances, maya.id) - net(before.body, maya.id)).toBe(-5000);
    expect(net(body.balances, josh.id) - net(before.body, josh.id)).toBe(-4000);
    expect(net(body.balances, priya.id) - net(before.body, priya.id)).toBe(9000);
    expect(net(body.balances, sam.id) - net(before.body, sam.id)).toBe(0);
  });

  it("I9 rejects percentages that add up to 99.99% with a readable message, and saves nothing", async () => {
    const before = await expenseCount();
    const res = await post({
      description: "Utilities",
      amountCents: 12_000,
      paidById: maya.id,
      split: {
        type: "PERCENT",
        shares: [
          { userId: maya.id, basisPoints: 5000 },
          { userId: josh.id, basisPoints: 4999 },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ApiErrorCode.validationFailed);
    expect(res.body.error.details).toContainEqual({
      path: "split.shares",
      message: "Percentages add up to 99.99%, not 100%",
    });
    expect(await expenseCount()).toBe(before);
  });

  it("E2 rejects custom amounts one cent short of the total, and saves nothing", async () => {
    const before = await expenseCount();
    const res = await post({
      description: "Concert tickets",
      amountCents: 9000,
      paidById: maya.id,
      split: {
        type: "EXACT",
        shares: [
          { userId: maya.id, shareCents: 5000 },
          { userId: josh.id, shareCents: 3999 },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      path: "split.shares",
      message: "Custom amounts add up to $89.99, not $90.00",
    });
    expect(await expenseCount()).toBe(before);
  });

  it("rejects a share for someone outside the group (422) and saves nothing", async () => {
    const before = await expenseCount();
    const res = await post({
      description: "Dinner",
      amountCents: 4000,
      paidById: maya.id,
      split: {
        type: "EXACT",
        shares: [
          { userId: maya.id, shareCents: 2000 },
          { userId: riley.id, shareCents: 2000 },
        ],
      },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ApiErrorCode.shareNotMember);
    expect(res.body.error.details).toEqual({ userIds: [riley.id] });
    expect(await expenseCount()).toBe(before);
  });

  it.each([
    ["the same member twice", { type: "PERCENT", shares: [{ userId: maya.id, basisPoints: 5000 }, { userId: maya.id, basisPoints: 5000 }] }],
    ["a negative custom amount", { type: "EXACT", shares: [{ userId: maya.id, shareCents: 5000 }, { userId: josh.id, shareCents: -1000 }] }],
    ["a fraction of a basis point", { type: "PERCENT", shares: [{ userId: maya.id, basisPoints: 5000.5 }, { userId: josh.id, basisPoints: 4999.5 }] }],
    ["an empty share list", { type: "EXACT", shares: [] }],
    ["an unknown split type", { type: "SHARES", shares: [] }],
    ["an extra field in a share", { type: "EXACT", shares: [{ userId: maya.id, shareCents: 4000, note: "x" }] }],
  ])("rejects %s with 400", async (_label, split) => {
    const res = await post({ description: "Test", amountCents: 4000, paidById: maya.id, split } as never);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ApiErrorCode.validationFailed);
  });

  it("still splits evenly when a walking-skeleton client sends no split", async () => {
    const res = await post({ description: "Paper towels", amountCents: 1001, paidById: priya.id });
    expect(res.status).toBe(201);
    expect(res.body.expense.splitType).toBe("EVEN");
    expect(sharesByName(res.body)).toEqual({ Maya: 251, Josh: 250, Priya: 250, Sam: 250 });
  });

  it("replays a retried percent split instead of saving it twice", async () => {
    const body: CreateExpenseRequest = {
      description: "Internet",
      amountCents: 7000,
      paidById: sam.id,
      split: { type: "PERCENT", shares: [{ userId: sam.id, basisPoints: 2500 }, { userId: josh.id, basisPoints: 7500 }] },
    };
    const send = () => request(app).post(`${GROUP}/expenses`).set(as(sam.id)).set(IDEMPOTENCY_HEADER, "pct-retry-0001").send(body);
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.expense.id).toBe(first.body.expense.id);
    expect(second.body.expense.shares).toEqual(first.body.expense.shares);
  });
});
