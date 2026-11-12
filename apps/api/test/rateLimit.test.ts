/**
 * Rate limiting (threat model: denial of service). Unit tests for the limiter with a fake clock, then
 * the real app to show one user's flood gets 429s while another user is unaffected.
 */
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorCode, DEMO_GROUP, DEMO_USERS, DEV_USER_HEADER } from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";
import { errorHandler } from "../src/http/errors.ts";
import { rateLimit } from "../src/http/rateLimit.ts";

function limitedApp(options: { limit: number; windowMs: number; maxKeys?: number }, clock: { now: number }) {
  const app = express();
  app.use(rateLimit({ ...options, key: (req) => req.header("x-key") ?? "anon", now: () => clock.now }));
  app.get("/", (_req, res) => void res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("rateLimit", () => {
  it("allows `limit` requests per window, then answers 429 with Retry-After", async () => {
    const clock = { now: 1_000_000 };
    const app = limitedApp({ limit: 3, windowMs: 60_000 }, clock);

    for (let i = 0; i < 3; i++) expect((await request(app).get("/")).status).toBe(200);

    clock.now += 15_000;
    const blocked = await request(app).get("/");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe(ApiErrorCode.rateLimited);
    expect(blocked.headers["retry-after"]).toBe("45");
  });

  it("starts a fresh window once the old one has passed", async () => {
    const clock = { now: 0 };
    const app = limitedApp({ limit: 1, windowMs: 60_000 }, clock);
    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).get("/")).status).toBe(429);
    clock.now = 60_000;
    expect((await request(app).get("/")).status).toBe(200);
  });

  it("counts each key separately", async () => {
    const app = limitedApp({ limit: 1, windowMs: 60_000 }, { now: 0 });
    expect((await request(app).get("/").set("x-key", "a")).status).toBe(200);
    expect((await request(app).get("/").set("x-key", "a")).status).toBe(429);
    expect((await request(app).get("/").set("x-key", "b")).status).toBe(200);
  });

  it("never tracks more than maxKeys callers", async () => {
    const clock = { now: 0 };
    const app = limitedApp({ limit: 1, windowMs: 60_000, maxKeys: 2 }, clock);
    for (const k of ["a", "b", "c"]) expect((await request(app).get("/").set("x-key", k)).status).toBe(200);
    // "a" was evicted to make room for "c", so it gets a new window; "c" is still tracked.
    expect((await request(app).get("/").set("x-key", "c")).status).toBe(429);
    expect((await request(app).get("/").set("x-key", "a")).status).toBe(200);
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)("per-user rate limit on the real app", () => {
  const db = createDb(databaseUrl!);
  const app = createApp({ db, userRateLimit: { limit: 5, windowMs: 60_000 } });
  const as = (userId: string) => ({ [DEV_USER_HEADER]: userId });
  const { maya, josh } = DEMO_USERS;

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("one member hammering the API is cut off; another member is not affected", async () => {
    const paths = ["/users/me", "/users/me/groups", `/groups/${DEMO_GROUP.id}`, `/groups/${DEMO_GROUP.id}/balances`, `/groups/${DEMO_GROUP.id}/settle-up`];
    for (const path of paths) expect((await request(app).get(path).set(as(maya.id))).status, path).toBe(200);

    // The limit is per user across every route, including the expensive settle-up planner.
    const sixth = await request(app).get(`/groups/${DEMO_GROUP.id}/settle-up`).set(as(maya.id));
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe(ApiErrorCode.rateLimited);
    expect(Number(sixth.headers["retry-after"])).toBeGreaterThan(0);

    expect((await request(app).get(`/groups/${DEMO_GROUP.id}/balances`).set(as(josh.id))).status).toBe(200);
  });

  it("requests without a valid identity are refused before they are counted", async () => {
    for (let i = 0; i < 8; i++) expect((await request(app).get("/users/me")).status).toBe(401);
  });

  it("/health is never limited, so Render's health check can't be starved", async () => {
    for (let i = 0; i < 8; i++) expect((await request(app).get("/health")).status).toBe(200);
  });
});
