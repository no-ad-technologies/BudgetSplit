/**
 * Feature tests for US-07: a payment counts only after both sides confirm it.
 * Real app + real Postgres. Also checks the US-06 criterion that making every suggested payment brings
 * every balance to $0.00, end to end through the API.
 */
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiErrorCode,
  DEMO_GROUP,
  DEMO_USERS,
  DEV_USER_HEADER,
  IDEMPOTENCY_HEADER,
  type BalancesDto,
  type SettleUpDto,
  type SettlementResponse,
  type UserGroupsDto,
} from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const GROUP = `/groups/${DEMO_GROUP.id}`;
const { maya, josh, priya, sam, riley } = DEMO_USERS;

describe.skipIf(!databaseUrl)("US-07: confirm a settlement on both sides", () => {
  const db = createDb(databaseUrl!);
  const app = createApp({ db });
  const as = (userId: string) => ({ [DEV_USER_HEADER]: userId });

  const balances = async () => (await request(app).get(`${GROUP}/balances`).set(as(maya.id))).body as BalancesDto;
  const netOf = (b: BalancesDto) => Object.fromEntries(b.balances.map((x) => [x.displayName, x.netCents]));
  const record = (fromId: string, toUserId: string, amountCents: number) =>
    request(app).post(`${GROUP}/settlements`).set(as(fromId)).send({ toUserId, amountCents });
  const confirm = (settlementId: string, userId: string) =>
    request(app).post(`${GROUP}/settlements/${settlementId}/confirm`).set(as(userId));
  const reject = (settlementId: string, userId: string, reason: string) =>
    request(app).post(`${GROUP}/settlements/${settlementId}/reject`).set(as(userId)).send({ reason });

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("'Josh paid Maya $42.50' shows as Pending for both of them and balances don't change yet", async () => {
    const before = netOf(await balances());
    const res = await record(josh.id, maya.id, 4250);

    expect(res.status).toBe(201);
    const body = res.body as SettlementResponse;
    expect(body.settlement).toMatchObject({
      fromName: "Josh",
      toName: "Maya",
      amountCents: 4250,
      status: "PENDING",
      recordedById: josh.id,
      respondedById: null,
      respondedAt: null,
    });
    expect(netOf(body.balances)).toEqual(before);
    expect(netOf(await balances())).toEqual(before);

    for (const viewer of [josh.id, maya.id]) {
      const list = await request(app).get(`${GROUP}/settlements?status=PENDING`).set(as(viewer));
      expect(list.body.settlements.map((s: { id: string }) => s.id)).toEqual([body.settlement.id]);
    }
  });

  it("balances change only when Maya confirms, and the audit trail records who, when and how much", async () => {
    const before = netOf(await balances());
    const { settlement } = (await record(josh.id, maya.id, 4250)).body as SettlementResponse;

    const res = await confirm(settlement.id, maya.id);
    expect(res.status).toBe(200);
    const body = res.body as SettlementResponse;
    expect(netOf(body.balances)).toEqual({ ...before, Josh: before.Josh! + 4250, Maya: before.Maya! - 4250 });
    expect(body.balances.balances.reduce((sum, b) => sum + b.netCents, 0)).toBe(0);

    const stored = await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } });
    expect(stored).toMatchObject({
      status: "CONFIRMED",
      fromUserId: josh.id,
      toUserId: maya.id,
      recordedById: josh.id,
      respondedById: maya.id,
      amountCents: 4250,
      rejectReason: null,
    });
    expect(stored.respondedAt).toBeInstanceOf(Date);
    expect(stored.respondedAt!.getTime()).toBeGreaterThanOrEqual(stored.createdAt.getTime());
  });

  it("Maya can reject it with a reason; balances stay the same and the reason is kept", async () => {
    const before = netOf(await balances());
    const { settlement } = (await record(josh.id, maya.id, 4250)).body as SettlementResponse;

    const res = await reject(settlement.id, maya.id, "Didn't get it on Venmo");
    expect(res.status).toBe(200);
    expect(res.body.settlement).toMatchObject({ status: "REJECTED", rejectReason: "Didn't get it on Venmo", respondedById: maya.id });
    expect(netOf(res.body.balances)).toEqual(before);
  });

  it("requires a reason to reject", async () => {
    const { settlement } = (await record(josh.id, maya.id, 4250)).body as SettlementResponse;
    const res = await reject(settlement.id, maya.id, "   ");
    expect(res.status).toBe(400);
    expect((await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })).status).toBe("PENDING");
  });

  it("only the receiver can confirm or reject (403 for the payer and for bystanders)", async () => {
    const { settlement } = (await record(josh.id, maya.id, 4250)).body as SettlementResponse;
    for (const userId of [josh.id, priya.id]) {
      const res = await confirm(settlement.id, userId);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ApiErrorCode.notSettlementReceiver);
    }
    expect((await reject(settlement.id, sam.id, "nope")).status).toBe(403);
    expect((await confirm(settlement.id, riley.id)).status).toBe(403); // not even in the group
    expect((await db.settlement.findUniqueOrThrow({ where: { id: settlement.id } })).status).toBe("PENDING");
  });

  it("can't be confirmed twice or confirmed after a rejection (409)", async () => {
    const { settlement } = (await record(josh.id, maya.id, 4250)).body as SettlementResponse;
    expect((await confirm(settlement.id, maya.id)).status).toBe(200);
    const again = await confirm(settlement.id, maya.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe(ApiErrorCode.settlementNotPending);

    const second = (await record(josh.id, maya.id, 100)).body as SettlementResponse;
    expect((await reject(second.settlement.id, maya.id, "Wrong amount")).status).toBe(200);
    expect((await confirm(second.settlement.id, maya.id)).status).toBe(409);
  });

  it("counts a payment once when two confirms race (one 200, one 409)", async () => {
    const before = netOf(await balances());
    const { settlement } = (await record(josh.id, maya.id, 4250)).body as SettlementResponse;
    const results = await Promise.all([confirm(settlement.id, maya.id), confirm(settlement.id, maya.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(netOf(await balances()).Josh).toBe(before.Josh! + 4250);
  });

  it("records a retried request once (Idempotency-Key)", async () => {
    const send = () =>
      request(app)
        .post(`${GROUP}/settlements`)
        .set(as(josh.id))
        .set(IDEMPOTENCY_HEADER, "settle-retry-0001")
        .send({ toUserId: maya.id, amountCents: 4250 });
    const first = await send();
    const second = await send();
    expect([first.status, second.status]).toEqual([201, 200]);
    expect(second.body.settlement.id).toBe(first.body.settlement.id);
    expect(await db.settlement.count()).toBe(1);
  });

  it.each([
    ["paying yourself", () => record(josh.id, josh.id, 100), 422, ApiErrorCode.cannotPaySelf],
    ["paying someone outside the group", () => record(josh.id, riley.id, 100), 422, ApiErrorCode.payeeNotMember],
    ["a zero amount", () => record(josh.id, maya.id, 0), 400, ApiErrorCode.validationFailed],
    ["fractional cents", () => record(josh.id, maya.id, 12.5), 400, ApiErrorCode.validationFailed],
    ["a malformed settlement id", () => confirm("not-a-uuid", maya.id), 400, ApiErrorCode.invalidSettlementId],
    ["an unknown settlement", () => confirm("99999999-9999-4999-8999-999999999999", maya.id), 404, ApiErrorCode.settlementNotFound],
  ])("rejects %s", async (_label, send, status, code) => {
    const res = await send();
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it("US-06: recording and confirming every suggested payment brings every balance to $0.00", async () => {
    // Make the ledger less tidy than the seed first: a percent split and a custom split.
    await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(priya.id))
      .send({
        description: "Rent",
        amountCents: 180_000,
        paidById: priya.id,
        split: { type: "PERCENT", shares: [{ userId: maya.id, basisPoints: 4000 }, { userId: josh.id, basisPoints: 3500 }, { userId: priya.id, basisPoints: 2500 }] },
      });
    await request(app)
      .post(`${GROUP}/expenses`)
      .set(as(sam.id))
      .send({ description: "Gas", amountCents: 3333, paidById: sam.id, split: { type: "EXACT", shares: [{ userId: josh.id, shareCents: 3333 }] } });

    const plan = (await request(app).get(`${GROUP}/settle-up`).set(as(maya.id))).body as SettleUpDto;
    expect(plan.payments.length).toBeGreaterThan(0);
    for (const p of plan.payments) {
      const { settlement } = (await record(p.fromUserId, p.toUserId, p.amountCents)).body as SettlementResponse;
      expect((await confirm(settlement.id, p.toUserId)).status).toBe(200);
    }

    expect((await balances()).balances.every((b) => b.netCents === 0)).toBe(true);
    const after = (await request(app).get(`${GROUP}/settle-up`).set(as(maya.id))).body as SettleUpDto;
    expect(after.payments).toEqual([]);
  });

  it("the home screen sees confirmed settlements too (one shared balance query)", async () => {
    const { settlement } = (await record(josh.id, maya.id, 1882)).body as SettlementResponse;
    await confirm(settlement.id, maya.id);
    const home = (await request(app).get("/users/me/groups").set(as(josh.id))).body as UserGroupsDto;
    const groupView = netOf(await balances());
    expect(home.groups[0]!.netCents).toBe(groupView.Josh);
  });

  it("is protected by database constraints even if the API had a bug", async () => {
    const insert = (columns: string, values: string) =>
      db.$executeRawUnsafe(
        `INSERT INTO settlements (id, group_id, from_user_id, to_user_id, recorded_by_id, amount_cents${columns})
         VALUES (gen_random_uuid(), '${DEMO_GROUP.id}', '${josh.id}', '${maya.id}', '${josh.id}', 500${values})`,
      );
    // Confirmed without saying who confirmed it or when.
    await expect(insert(", status", ", 'CONFIRMED'")).rejects.toThrow();
    // "Confirmed" by someone other than the receiver.
    await expect(insert(", status, responded_by_id, responded_at", `, 'CONFIRMED', '${priya.id}', now()`)).rejects.toThrow();
    // Rejected without a reason.
    await expect(insert(", status, responded_by_id, responded_at", `, 'REJECTED', '${maya.id}', now()`)).rejects.toThrow();
    // Paying yourself, and a non-positive amount.
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO settlements (id, group_id, from_user_id, to_user_id, recorded_by_id, amount_cents)
         VALUES (gen_random_uuid(), '${DEMO_GROUP.id}', '${josh.id}', '${josh.id}', '${josh.id}', 500)`,
      ),
    ).rejects.toThrow();
    await expect(insert("", "").then(() => db.$executeRawUnsafe(`UPDATE settlements SET amount_cents = 0`))).rejects.toThrow();
  });
});
