/**
 * Feature tests for US-06: GET /groups/:groupId/settle-up through the real app and database.
 * The plan's math is unit- and property-tested in settlePlan.test.ts; these check the user flow.
 */
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorCode, DEMO_GROUP, DEMO_USERS, DEV_USER_HEADER, type SettleUpDto } from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const GROUP = `/groups/${DEMO_GROUP.id}`;
const { maya, josh, priya, sam, riley } = DEMO_USERS;

describe.skipIf(!databaseUrl)("US-06: fewest payments to settle up", () => {
  const db = createDb(databaseUrl!);
  const app = createApp({ db });
  const as = (userId: string) => ({ [DEV_USER_HEADER]: userId });
  const plan = async (userId: string = maya.id) => {
    const res = await request(app).get(`${GROUP}/settle-up`).set(as(userId));
    expect(res.status).toBe(200);
    return res.body as SettleUpDto;
  };
  const readable = (p: SettleUpDto) => p.payments.map((x) => `${x.fromName} pays ${x.toName} ${x.amountCents}`);

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("shows payer, receiver and an exact amount for each payment, using the fewest payments", async () => {
    // Seeded balances: Maya +33.72, Josh +18.82, Priya −26.27, Sam −26.27. No two-person pair cancels
    // out, so the minimum is 4 − 1 = 3 payments.
    const body = await plan();
    expect(body.exact).toBe(true);
    expect(readable(body)).toEqual(["Priya pays Maya 2627", "Sam pays Josh 1882", "Sam pays Maya 745"]);
    expect(body.payments[0]).toMatchObject({ fromUserId: priya.id, toUserId: maya.id });
  });

  it("every member sees the same plan", async () => {
    expect(await plan(sam.id)).toEqual(await plan(josh.id));
  });

  it("updates after an expense changes the balances", async () => {
    // Sam pays $105.08 for everyone ($26.27 each). Balances become Maya +7.45, Josh −7.45,
    // Priya −52.54, Sam +52.54: two pairs that cancel, so the plan drops from 3 payments to 2.
    await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(sam.id))
      .send({ description: "Cleaning service", amountCents: 10_508, paidById: sam.id });
    const body = await plan();
    expect(readable(body).sort()).toEqual(["Josh pays Maya 745", "Priya pays Sam 5254"]);
  });

  it("is empty when the group is settled up", async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
    await db.expenseShare.deleteMany({});
    await db.expense.deleteMany({});
    expect(await plan()).toEqual({ groupId: DEMO_GROUP.id, exact: true, payments: [] });
  });

  it("is only visible to members (403)", async () => {
    const res = await request(app).get(`${GROUP}/settle-up`).set(as(riley.id));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ApiErrorCode.notAMember);
  });
});
