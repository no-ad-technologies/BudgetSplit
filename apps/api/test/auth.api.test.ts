/**
 * Feature tests for US-01: sign in, and nobody else can act as you.
 * Real app + real Postgres + the real Firebase verifier, pointed at a key pair generated in the test
 * instead of Google's, so every check (signature, audience, issuer, expiry) runs for real.
 */
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorCode, DEMO_GROUP, DEMO_USERS, DEV_USER_HEADER, type GroupDto, type MeDto } from "@budgetsplit/shared";
import { createApp } from "../src/app.ts";
import { createDb } from "../src/db.ts";
import { resetTestDatabase, seedDemo } from "../src/dev/seed.ts";
import { initialDisplayName, tokenAuth } from "../src/http/auth.ts";
import { createFirebaseVerifier } from "../src/http/tokenVerifier.ts";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const PROJECT = "budgetsplit-test";
const ISSUER = `https://securetoken.google.com/${PROJECT}`;

type Keys = Awaited<ReturnType<typeof generateKeyPair>>;

describe.skipIf(!databaseUrl)("US-01: sign in with a Firebase ID token", () => {
  const db = createDb(databaseUrl!);
  let google: Keys; // stands in for Google's signing key
  let attacker: Keys; // a key Google never published
  let app: ReturnType<typeof createApp>;

  interface TokenOptions {
    uid?: string;
    name?: string;
    email?: string;
    emailVerified?: boolean;
    audience?: string;
    issuer?: string;
    expiresIn?: string;
    signWith?: Keys;
    alg?: string;
  }
  const token = async (o: TokenOptions = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      auth_time: now - 10,
      ...(o.name ? { name: o.name } : {}),
      ...(o.email ? { email: o.email, email_verified: o.emailVerified ?? true } : {}),
    })
      .setProtectedHeader({ alg: o.alg ?? "RS256", kid: "test-key" })
      .setSubject(o.uid ?? "firebase-uid-josh")
      .setAudience(o.audience ?? PROJECT)
      .setIssuer(o.issuer ?? ISSUER)
      .setIssuedAt(now - 10)
      .setExpirationTime(o.expiresIn ?? "1h")
      .sign((o.signWith ?? google).privateKey);
  };
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    google = await generateKeyPair("RS256");
    attacker = await generateKeyPair("RS256");
    const jwk: JWK = { ...(await exportJWK(google.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
    const verifier = createFirebaseVerifier({ projectId: PROJECT, keys: createLocalJWKSet({ keys: [jwk] }) });
    app = createApp({ db, authenticate: tokenAuth(db, verifier) });
  });

  beforeEach(async () => {
    await resetTestDatabase(db, databaseUrl!);
    await seedDemo(db);
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("a new user's first request creates their account with their display name", async () => {
    const res = await request(app)
      .get("/users/me")
      .set(bearer(await token({ name: "Josh Okafor", email: "josh@hc.edu" })));

    expect(res.status).toBe(200);
    const me = res.body as MeDto;
    expect(me.displayName).toBe("Josh Okafor");
    const row = await db.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(row).toMatchObject({ authUid: "firebase-uid-josh", email: "josh@hc.edu" });
  });

  it("the same person on a second phone gets the same account, groups and balances", async () => {
    const phone1 = bearer(await token({ name: "Josh" }));
    const created = await request(app).post("/groups").set(phone1).send({ name: "Road Trip" });
    expect(created.status).toBe(201);

    const phone2 = bearer(await token({ name: "Josh" })); // a different token, same Firebase account
    const me1 = (await request(app).get("/users/me").set(phone1)).body as MeDto;
    const me2 = (await request(app).get("/users/me").set(phone2)).body as MeDto;
    expect(me2).toEqual(me1);

    const home = await request(app).get("/users/me/groups").set(phone2);
    expect(home.body.groups).toEqual([{ groupId: (created.body as GroupDto).id, groupName: "Road Trip", netCents: 0 }]);
    expect(await db.user.count({ where: { authUid: "firebase-uid-josh" } })).toBe(1);
  });

  it("two first requests at the same moment still create one account", async () => {
    const t = bearer(await token({ name: "Josh" }));
    const results = await Promise.all(Array.from({ length: 5 }, () => request(app).get("/users/me").set(t)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(results.map((r) => (r.body as MeDto).id)).size).toBe(1);
    expect(await db.user.count({ where: { authUid: "firebase-uid-josh" } })).toBe(1);
  });

  it("a signed-in user who is not in a group gets 403 from it", async () => {
    const res = await request(app).get(`/groups/${DEMO_GROUP.id}/balances`).set(bearer(await token()));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ApiErrorCode.notAMember);
  });

  describe("any call without a valid token is a 401", () => {
    const expect401 = async (headers: Record<string, string>) => {
      for (const path of ["/users/me", "/users/me/groups", `/groups/${DEMO_GROUP.id}/balances`]) {
        const res = await request(app).get(path).set(headers);
        expect(res.status, path).toBe(401);
        expect(res.body.error.code).toBe(ApiErrorCode.unauthenticated);
      }
    };

    it("no Authorization header", () => expect401({}));
    it("not a Bearer token", () => expect401({ Authorization: "Basic am9zaDpwdw==" }));
    it("garbage instead of a JWT", () => expect401({ Authorization: "Bearer not-a-token" }));
    it("an expired token", async () => expect401(bearer(await token({ expiresIn: "-1h" }))));
    it("a token for a different Firebase project", async () => expect401(bearer(await token({ audience: "someone-elses-app" }))));
    it("a token from a different issuer", async () =>
      expect401(bearer(await token({ issuer: "https://securetoken.google.com/someone-elses-app" }))));
    it("a token signed with a key Google never published", async () => expect401(bearer(await token({ signWith: attacker }))));
    it("a token whose payload was edited after signing", async () => {
      const [h, p, s] = (await token({ uid: "firebase-uid-josh" })).split(".") as [string, string, string];
      const payload = JSON.parse(Buffer.from(p, "base64url").toString()) as Record<string, unknown>;
      const forged = Buffer.from(JSON.stringify({ ...payload, sub: "firebase-uid-maya" })).toString("base64url");
      await expect401({ Authorization: `Bearer ${h}.${forged}.${s}` });
    });
    it('an unsigned token (alg "none")', async () => {
      const now = Math.floor(Date.now() / 1000);
      const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const unsigned = `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "x", aud: PROJECT, iss: ISSUER, iat: now, exp: now + 3600, auth_time: now })}.`;
      await expect401({ Authorization: `Bearer ${unsigned}` });
    });
    it("an oversized Authorization header", () => expect401({ Authorization: `Bearer ${"a".repeat(5000)}.b.c` }));
  });

  it("the dev header no longer works: knowing a user id is not enough to act as them", async () => {
    const res = await request(app).get(`/groups/${DEMO_GROUP.id}/balances`).set({ [DEV_USER_HEADER]: DEMO_USERS.maya.id });
    expect(res.status).toBe(401);
  });

  it("an unverified email is not stored, and a taken email does not block sign-in", async () => {
    await request(app).get("/users/me").set(bearer(await token({ uid: "u1", email: "a@hc.edu", emailVerified: false })));
    expect((await db.user.findUniqueOrThrow({ where: { authUid: "u1" } })).email).toBeNull();

    await db.user.create({ data: { displayName: "Old row", email: "taken@hc.edu" } });
    const res = await request(app).get("/users/me").set(bearer(await token({ uid: "u2", email: "taken@hc.edu" })));
    expect(res.status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { authUid: "u2" } })).email).toBeNull();
  });

  it("/health stays public", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
  });
});

describe("initialDisplayName", () => {
  it("prefers the provider's name, then the email's local part, then a placeholder", () => {
    expect(initialDisplayName({ uid: "u", name: "Priya N", email: "p@hc.edu" })).toBe("Priya N");
    expect(initialDisplayName({ uid: "u", email: "sam.mendoza@hc.edu" })).toBe("sam.mendoza");
    expect(initialDisplayName({ uid: "u" })).toBe("New member");
  });

  it("strips control characters and caps the length at the column size", () => {
    expect(initialDisplayName({ uid: "u", name: "Jo\u0000sh\n" })).toBe("Josh");
    expect(initialDisplayName({ uid: "u", name: "x".repeat(200) })).toHaveLength(60);
  });
});
