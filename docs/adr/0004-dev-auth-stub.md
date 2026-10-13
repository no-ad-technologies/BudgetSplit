# ADR 0004 · Dev-only auth stub now, Firebase Authentication in US-01

- **Status:** Accepted · 2026-10-13

## Context
The walking skeleton must run through the real request path, including authorization, before sign-in exists.

## Decision
`devAuth` trusts an `X-User-Id` header naming an existing user. It is the only authentication code; routes read
`res.locals.user` and never the header. US-01 replaces this one middleware with Firebase ID-token verification.
Group membership is already enforced for real (`requireGroupMember`, 403 for non-members).
`loadConfig` refuses to start in production with dev auth unless `ALLOW_DEV_AUTH_IN_PRODUCTION=true`, which is set only
for the seeded M2 demo deployment.

## Consequences
Anyone who knows a seeded user id can act as that user on the demo deployment. Acceptable only while it holds seed data;
removing the flag after US-01 makes the API refuse to boot with the stub.
