/**
 * Walking-skeleton integration tests: the real Express app, the real Prisma client and a real
 * PostgreSQL test database. These exercise the same path the mobile app uses:
 * HTTP -> validation and auth -> expense service -> Prisma -> Postgres -> balances.
 */
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_GROUP,
  DEMO_USERS,
  DEV_USER_HEADER,
  IDEMPOTENCY_HEADER,
  type BalancesDto,
  type CreateExpenseResponse,
  type GroupDto,
} from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl && process.env.CI) {
  throw new Error("CI must set DATABASE_URL (or TEST_DATABASE_URL) for the integration tests");
}

const GROUP = `/groups/${DEMO_GROUP.id}`;
const { maya, josh, priya, sam, riley } = DEMO_USERS;

describe.skipIf(!databaseUrl)("walking skeleton: add an expense, see balances (US-03, US-05)", () => {
  const db = createDb(databaseUrl!);
  const app = createApp({ db });
  const as = (userId: string) => ({ [DEV_USER_HEADER]: userId });

  const netOf = (body: BalancesDto) => Object.fromEntries(body.balances.map((b) => [b.displayName, b.netCents]));
  const sumOfNets = (body: BalancesDto) => body.balances.reduce((sum, b) => sum + b.netCents, 0);
  const expenseCount = () => db.expense.count({ where: { groupId: DEMO_GROUP.id } });

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("reports healthy when the database is reachable", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "ok" });
  });

  describe("authentication and authorization (US-01 seam)", () => {
    it("rejects a request with no user header (401)", async () => {
      const res = await request(app).get(`${GROUP}/balances`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("unauthenticated");
    });

    it("rejects an unknown user (401)", async () => {
      const res = await request(app).get(`${GROUP}/balances`).set(as("99999999-9999-4999-8999-999999999999"));
      expect(res.status).toBe(401);
    });

    it("rejects a signed-in user who is not in the group (403)", async () => {
      const res = await request(app).get(`${GROUP}/balances`).set(as(riley.id));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("not_a_member");
    });

    it("rejects a malformed group id (400)", async () => {
      const res = await request(app).get("/groups/not-a-uuid/balances").set(as(maya.id));
      expect(res.status).toBe(400);
    });
  });

  it("returns the group with members in join order", async () => {
    const res = await request(app).get(GROUP).set(as(josh.id));
    expect(res.status).toBe(200);
    const body = res.body as GroupDto;
    expect(body.name).toBe("Maple St House");
    expect(body.members.map((m) => m.displayName)).toEqual(["Maya", "Josh", "Priya", "Sam"]);
  });

  it("returns seeded balances that sum to zero", async () => {
    const res = await request(app).get(`${GROUP}/balances`).set(as(maya.id));
    expect(res.status).toBe(200);
    // WiFi $60.00 paid by Maya + Groceries $45.10 paid by Josh, split 4 ways.
    expect(netOf(res.body)).toEqual({ Maya: 3372, Josh: 1882, Priya: -2627, Sam: -2627 });
    expect(sumOfNets(res.body)).toBe(0);
  });

  it("adds $50.00 paid by Maya: $12.50 each, Maya's balance rises by $37.50", async () => {
    const res = await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(maya.id))
      .send({ description: "Groceries", amountCents: 5000, paidById: maya.id });

    expect(res.status).toBe(201);
    const body = res.body as CreateExpenseResponse;
    expect(body.replayed).toBe(false);
    expect(body.expense.shares.map((s) => s.shareCents)).toEqual([1250, 1250, 1250, 1250]);
    expect(netOf(body.balances).Maya).toBe(3372 + 3750);
    expect(sumOfNets(body.balances)).toBe(0);

    // The next read sees the same thing: the write really committed.
    const after = await request(app).get(`${GROUP}/balances`).set(as(sam.id));
    expect(netOf(after.body)).toEqual(netOf(body.balances));
  });

  it("gives the leftover cent of $10.01 to the first member to join (Maya)", async () => {
    const res = await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(priya.id))
      .send({ description: "Paper towels", amountCents: 1001, paidById: priya.id });

    expect(res.status).toBe(201);
    const shares = Object.fromEntries(
      (res.body as CreateExpenseResponse).expense.shares.map((s) => [s.userId, s.shareCents]),
    );
    expect(shares).toEqual({ [maya.id]: 251, [josh.id]: 250, [priya.id]: 250, [sam.id]: 250 });
  });

  it.each([
    ["zero amount", { description: "Free stuff", amountCents: 0 }],
    ["fractional cents", { description: "Snacks", amountCents: 12.5 }],
    ["over $10,000.00", { description: "Car", amountCents: 1_000_001 }],
    ["blank description", { description: "   ", amountCents: 500 }],
    ["81-character description", { description: "x".repeat(81), amountCents: 500 }],
    ["unknown field", { description: "Pizza", amountCents: 500, tip: 100 }],
  ])("rejects %s with 400 and saves nothing", async (_label, partial) => {
    const before = await expenseCount();
    const res = await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(maya.id))
      .send({ paidById: maya.id, ...partial });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_failed");
    expect(await expenseCount()).toBe(before);
  });

  it("rejects a payer who is not in the group (422) and saves nothing", async () => {
    const before = await expenseCount();
    const res = await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(maya.id))
      .send({ description: "Pizza", amountCents: 2000, paidById: riley.id });
    expect(res.status).toBe(422);
    expect(await expenseCount()).toBe(before);
  });

  it("rejects malformed JSON (400)", async () => {
    const res = await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(maya.id))
      .set("Content-Type", "application/json")
      .send('{"description": "oops"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_json");
  });

  describe("idempotency (trade-off T1)", () => {
    const send = (key: string) =>
      request(app)
        .post(`${GROUP}/expenses`)
        .set(as(josh.id))
        .set(IDEMPOTENCY_HEADER, key)
        .send({ description: "Dinner on the trip", amountCents: 8400, paidById: josh.id });

    it("records a retried request once and replays the original", async () => {
      const before = await expenseCount();
      const first = await send("retry-test-0001");
      const second = await send("retry-test-0001");

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.replayed).toBe(true);
      expect(second.body.expense.id).toBe(first.body.expense.id);
      expect(await expenseCount()).toBe(before + 1);
    });

    it("records one expense when five identical requests race", async () => {
      const before = await expenseCount();
      const results = await Promise.all(Array.from({ length: 5 }, () => send("race-test-0001")));

      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.expense.id)).size).toBe(1);
      expect(await expenseCount()).toBe(before + 1);
    });
  });

  it("lists expenses newest first", async () => {
    await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(maya.id))
      .send({ description: "Dish soap", amountCents: 499, paidById: maya.id });

    const res = await request(app).get(`${GROUP}/expenses?limit=2`).set(as(maya.id));
    expect(res.status).toBe(200);
    expect(res.body.expenses.map((e: { description: string }) => e.description)).toEqual([
      "Dish soap",
      "Groceries",
    ]);
  });

  it("is protected by database constraints even if the API had a bug", async () => {
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO expenses (id, group_id, paid_by_id, created_by_id, description, amount_cents)
         VALUES (gen_random_uuid(), '${DEMO_GROUP.id}', '${maya.id}', '${maya.id}', 'bad', -500)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO expenses (id, group_id, paid_by_id, created_by_id, description, amount_cents)
         VALUES (gen_random_uuid(), '${DEMO_GROUP.id}', '${riley.id}', '${maya.id}', 'outsider', 500)`,
      ),
    ).rejects.toThrow();
  });

  it("answers unknown routes with 404 in the standard error shape", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});
