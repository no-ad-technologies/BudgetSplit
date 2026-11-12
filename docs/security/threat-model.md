# BudgetSplit threat model (Milestone 4, Ch. 7)

Two attacks from Chapter 7, chosen because they are the two that can actually hurt this system:

1. **Session hijacking**: acting as another member.
2. **Denial of service**: making the app unusable, or running up its bills.

Why these and not the others is recorded in [ADR 0009](../adr/0009-threat-model-scope.md) and summarized
[at the end](#attacks-considered-and-not-selected).

Each measure below is marked **Implemented** (in code, with a test) or **Proposed** (not built).
"Implemented" measures from US-01 and US-11 are on their feature branches until those pull requests merge;
the place each one lives is given so it can be checked.

## What we are protecting

| Asset | Why it matters |
| --- | --- |
| The ledger (expenses, shares, settlements) | It says who owes whom real money. A false entry or a false "confirmed" costs someone cash and trust. |
| A member's identity | Every write is attributed to a member. Settlements are confirmed by one specific person. |
| Group membership and invite links | Anyone in a group sees its balances and can add expenses to it. |
| Availability | Roommates check balances at the moment they are paying each other. |
| The Anthropic API key and budget | Each new AI summary is a paid call. |

The system: an Expo mobile app, one Express API on a single Render instance, one Postgres database,
Firebase Authentication for sign-in, Anthropic for the AI summary ([architecture](../architecture.md)).

---

## Attack 1 · Session hijacking

**The attack.** Instead of guessing a password, the attacker gets hold of whatever proves a signed-in
user's identity (a session id, a token) and uses it to make requests as that user.

### How it could affect BudgetSplit

Before Milestone 4 this needed no skill at all. The API trusted an `X-User-Id` header (ADR 0004), and the
deployed service allowed it (`ALLOW_DEV_AUTH_IN_PRODUCTION=true`). User ids are not secret: every member of
a group receives the ids of all other members in `GET /groups/:id`. So any member could send one request
with a roommate's id and:

- **confirm a settlement addressed to that roommate**, making a debt disappear without paying it;
- **record expenses** that the roommate supposedly paid or owes;
- as the group's admin, **create invite links** and bring strangers into the group;
- read the balances of every other group that roommate is in.

With real sign-in, the same outcomes are still the goal; the attacker now has to steal one of three things:

| What could be stolen | How | What it gives the attacker |
| --- | --- | --- |
| The ID token sent on every request | Network interception if the app talks plain HTTP; a log that records headers | Full access as the victim for up to one hour |
| The refresh token on the phone | Malware, a device backup, an unlocked phone | Access until the victim changes their password or the account is disabled |
| An invite token | The link is shared in a group chat; logs | Membership of that group for anyone, for up to 7 days |

### Security measures

**Implemented**

| Measure | Where | Test |
| --- | --- | --- |
| Identity comes only from a signed Firebase ID token, verified on every request: RS256 signature against Google's keys, audience and issuer pinned to our project, expiry, non-empty subject. A user id alone is worth nothing. | `apps/api/src/http/tokenVerifier.ts`, `tokenAuth` in `http/auth.ts` (US-01, [ADR 0007](../adr/0007-firebase-id-tokens.md)) | `test/auth.api.test.ts`: 401 for a missing, malformed, expired, wrong-project, wrong-issuer, wrong-key, tampered, `alg: none` and oversized token; "the dev header no longer works" |
| The dev stub cannot run in production. The API refuses to start with `AUTH_MODE=dev` there, and `render.yaml` no longer sets the override. | `apps/api/src/config.ts`, `render.yaml` | `test/config.test.ts` |
| Short-lived credentials. ID tokens expire after one hour, so a stolen one stops working without anyone noticing the theft. | Firebase; expiry enforced in `tokenVerifier.ts` | "an expired token" |
| No server-side session and no cookie. There is no session id to fix or steal, and requests can't be forged from another site (no ambient credential, so no CSRF). | Design (ADR 0007) | n/a |
| The refresh token is kept in the iOS Keychain / Android Keystore; the ID token only in memory. Sign-out deletes both. | `apps/mobile/src/auth/session.ts`, `secureStorage.ts` | `session.test.ts`: "stores only the refresh token", "sign-out forgets the token", "a refresh token Firebase has revoked signs the device out" |
| Tokens travel in the `Authorization` header, never in a URL, and the request log records method, path, status and latency only. | `apps/mobile/src/api/client.ts`, `http/requestLog.ts` | n/a |
| Invite tokens are 144 random bits, stored only as a SHA-256 hash, expire after 7 days, and can be revoked by an admin. | `modules/groups/groups.service.ts` (US-02) | `test/groups.api.test.ts` |
| **Found while writing this document:** the request log wrote the full path, so `POST /invites/<token>/accept` put working invite tokens in Render's logs. Now logged as `/invites/[token]/accept`. | `http/requestLog.ts` (`loggablePath`) | `test/requestLog.test.ts` |
| Authorization is separate from authentication: a valid token for one member gives no access to a group they are not in. A hijacked account is limited to that member's groups. | `requireGroupMember` in `http/auth.ts` | 403 tests in every `*.api.test.ts` |
| Every rejected token is the same 401; the reason goes to our log (`token_rejected`), not to the caller. | `tokenAuth` | `test/auth.api.test.ts` |
| Passwords never reach our API or database. | Design: the app sends them to Firebase over HTTPS | n/a |
| Transport: Render serves the API over HTTPS and redirects plain HTTP. | Render | n/a |
| Damage control: a settlement can only be confirmed by its receiver, and settlements are never edited or deleted, so a hijacked session leaves an audit trail. | `settlements.service.ts`, CHECK constraints (US-07) | `test/settlements.api.test.ts` |

**Proposed**

- **Revocation check.** A stolen ID token works until it expires (at most one hour) even after the
  victim changes their password. Closing that window means calling Firebase on each request or using the
  Admin SDK's revocation check, which needs a service-account secret. Not worth it yet (ADR 0007).
- **Force HTTPS in the app.** The app accepts whatever `EXPO_PUBLIC_API_URL` says, and local development
  uses `http://` on the LAN. A release build should refuse any API URL that is not `https://`.
- **Require a verified email** before an account can create groups or accept invites.
- **Re-authenticate for sensitive actions** (confirming a settlement above some amount).
- **"Sign out everywhere"** in the app, backed by Firebase's revoke-refresh-tokens call.
- **Shorter-lived, single-use invite links** for groups that want them.

### Residual risk

An attacker who has the victim's unlocked phone has the victim's session; no server-side measure changes
that. A stolen ID token is good for up to an hour. Both are accepted for a roommate expense app, and both
leave an audit trail in the ledger.

---

## Attack 2 · Denial of service

**The attack.** The attacker sends more work than the system can do, so legitimate users are slowed down
or shut out. A variant aims at the bill instead of the server: make the system spend money until someone
has to turn it off.

### How it could affect BudgetSplit

The whole product is one free Render instance and a 256 MB Postgres. It does not take a botnet:

- **One signed-in account in a loop.** `GET /users/me/groups` runs five queries per group the user is in;
  `GET /groups/:id/settle-up` runs an exact search. A script calling them as fast as it can would keep the
  database pool and the Node event loop busy for everyone. Before Milestone 4 nothing limited this.
- **Running up the AI bill.** Every new summary is a paid call to Anthropic with up to a 10-second wait.
  A script requesting summaries in a loop spends the team's money and holds connections open.
- **Oversized or pathological input**: a huge JSON body, a 5,000-member group, a settle-up over hundreds
  of members.
- **A flood of unauthenticated requests** from many machines, aimed at the instance itself.

The damage is practical: roommates can't see what they owe or record that they paid, and, for the AI
variant, a real bill.

### Security measures

**Implemented**

| Measure | Where | Test |
| --- | --- | --- |
| **Per-user rate limit**: 120 requests per signed-in user per minute across every authenticated route, then `429 rate_limited` with `Retry-After`. Keyed on the verified user id because client IP addresses are not trustworthy behind Render's proxy. | `apps/api/src/http/rateLimit.ts`, mounted in `app.ts` ([ADR 0008](../adr/0008-per-user-rate-limit.md)) | `test/rateLimit.test.ts`: "one member hammering the API is cut off; another member is not affected" |
| **AI call quota**: at most 5 new summaries per member and 10 per group per 10 minutes, and 500 per day for the whole service. Over quota, the endpoint still returns the plain numbers. | `modules/insights/quota.ts` (US-11) | `test/insights.unit.test.ts` (SummaryQuota), `test/summary.api.test.ts`: "a member who keeps forcing new model calls is limited" |
| **Summary cache and shared calls**: a summary is reused until the group's numbers change, and members asking at the same moment share one model call. Repeat requests cost nothing. | `modules/insights/insights.service.ts` | "a summary is reused until the numbers change", "members asking at the same moment share one model call" |
| **Timeout and fallback on the model call**: 10 seconds, then "Summary unavailable". The ledger never waits on Anthropic. | `modules/insights/llm.ts`, `insights.service.ts` | "a model error or timeout is unavailable, never a 500" |
| **Cheap rejection**: a request without a valid token is refused after a signature check against cached keys, before any database query. | `tokenAuth` | `test/auth.api.test.ts` |
| **Bounded work per request**: JSON bodies limited to 10 KB; groups capped at 50 members; the exact settle-up search runs only up to 12 members with a balance and switches to a linear-time plan above that; list endpoints capped at 100 rows; amounts capped. | `app.ts`, `packages/shared/src/money.ts`, `modules/settlements/plan.ts`, zod schemas | `test/settlePlan.test.ts`, `test/groups.api.test.ts`, `test/expenses.api.test.ts` |
| **Retries don't multiply work or data**: `Idempotency-Key` on expense and settlement writes. | `expenses.service.ts`, `settlements.service.ts` | idempotency tests in both suites |
| **Health check outside the limits**, so Render can always tell the instance is alive and restart it if not. | `GET /health` in `app.ts` | "/health is never limited" |
| **The limiter can't be turned into the attack**: it tracks at most 10,000 keys and evicts the oldest. | `rateLimit.ts`, `quota.ts` | "never tracks more than maxKeys callers" |

**Proposed**

- **A CDN / WAF in front of Render** (for example Cloudflare's free tier) to absorb unauthenticated
  floods and to give us a client IP we can trust for a second, per-IP limit.
- **Limit account creation**: require a verified email, and enable Firebase App Check so only our app can
  create accounts. Today an attacker can register many accounts, each with its own 120 requests a minute.
- **A statement timeout on the database role**, so no single query can hold a connection for long.
- **An alert** when 429s or p95 latency (already logged per request) pass a threshold.
- **A spending cap on the Anthropic account** itself, as a backstop to the daily limit in code.
- **A shared store for the counters (Redis)** if the API ever runs on more than one instance. Today the
  counters are in memory, which is correct for one instance and resets on every deploy.
- **A paid Render instance** for demo weeks: the free one sleeps after 15 idle minutes, which looks like
  an outage without any attacker.

### Residual risk

A large flood of unauthenticated traffic is handled only by Render's own network protection. Many fake
accounts multiply the per-user limit until account creation is restricted. Both are accepted for now and
are the first two proposed items.

---

## Attacks considered and not selected

| Attack | Why it is not one of the two | What already covers it |
| --- | --- | --- |
| SQL injection | No query is built from strings. | Prisma parameterizes every query; every body, id and query parameter is validated by a strict zod schema before use. The two raw statements in request paths (the health-check `SELECT 1` and the row lock taken when someone joins a group) use tagged templates, which also send values as parameters. |
| Cross-site scripting | The client is a React Native app, not a browser page. It renders text as text and has no cookies to steal. | React Native `Text`; names and AI output are never interpreted as markup. Would need revisiting if a web client is added. |
| Brute-force attack | Passwords are checked by Firebase, not by us, and Firebase throttles repeated failures. Invite tokens have 144 bits of entropy. | Firebase throttling; the sign-in form gives the same message for a wrong email and a wrong password; the per-user rate limit (ADR 0008). |
| Prompt injection (AI feature) | Covered separately, as the assignment asks. | [docs/ai/m4-ai-evaluation.md](../ai/m4-ai-evaluation.md) |

## Review

Revisit this document when any of these change: a web client is added (XSS and CSRF become live), the API
runs on more than one instance (in-memory limits stop being correct), free text is ever sent to the model,
or the app starts moving real money instead of recording it.
