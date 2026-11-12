# ADR 0008 · Rate limit by signed-in user, in memory

- **Status:** Accepted · 2026-11-12

## Context
Denial of service is the second attack in our threat model ([docs/security/threat-model.md](../security/threat-model.md)).
The API had no request limit at all: one account in a loop could keep the single free Render instance and
its small Postgres busy for everyone, most cheaply through `GET /groups/:id/settle-up` (an exact search)
and `GET /users/me/groups` (five queries per group).

The usual answer is a limit per IP address. Behind Render that does not work: its proxy appends to
`X-Forwarded-For` without removing what the client sent, so the API sees either the proxy's address
(every user in one bucket) or an address the caller made up (no limit).

## Decision
- `perUserRateLimit` (`apps/api/src/http/rateLimit.ts`) runs right after authentication on every
  authenticated route and counts requests against `res.locals.user.id`, the one identity a caller cannot
  choose. Default: **120 requests per user per minute** (`RATE_LIMIT_PER_MINUTE`, 0 = off).
- Over the limit: `429` with code `rate_limited` and a `Retry-After` header.
- Counters are a fixed window in process memory, capped at 10,000 tracked users. No new dependency and
  no new infrastructure.
- `/health` is outside the limit so Render's health check always gets through.

## Consequences
- Requests with no valid token are not counted. They are rejected before any database query (a signature
  check against cached keys), so they are cheap, but a large unauthenticated flood is left to Render's
  network-level protection. A CDN/WAF in front (e.g. Cloudflare) is the proposed next step.
- Counters reset on every deploy and are per instance. Scaling past one instance needs a shared store.
- A fixed window lets a user send up to twice the limit across a window boundary. Acceptable at this size.
