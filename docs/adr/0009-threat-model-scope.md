# ADR 0009 · The threat model covers session hijacking and denial of service

- **Status:** Accepted · 2026-11-12

## Context
Milestone 4 asks for a threat model of two attacks from Chapter 7 (injection, XSS, session hijacking,
DoS, brute force). We chose by looking at the repository as it stood on `main` after Milestone 3 and
asking, for each attack, whether it could succeed today and what it would cost a member.

## Decision
The threat model ([docs/security/threat-model.md](../security/threat-model.md)) analyses:

1. **Session hijacking.** On `main`, the deployed API accepted an `X-User-Id` header and group members can
   see each other's ids, so any member could act as any other: confirm a payment they never received
   one, add expenses in someone's name, invite strangers. This was the most serious open hole, and it is
   the attack the Milestone 4 authentication work (US-01) exists to close.
2. **Denial of service.** The API had no request limit, runs on one free instance with a small database,
   has an endpoint that does an exact search, and Milestone 4 adds a paid model call. One account in a
   loop could take the service down or run up a bill.

Not selected, with reasons:

- **SQL injection:** already closed by construction (Prisma parameterized queries, strict zod schemas).
  A section on it would describe a risk we do not have.
- **XSS:** the client is a React Native app with no HTML rendering and no cookies.
- **Brute force:** passwords are verified and throttled by Firebase, not by our code, and invite tokens
  have 144 bits of entropy. The per-user rate limit added for DoS covers what remains.

Prompt injection against the AI feature is a separate required deliverable and has its own document
([docs/ai/m4-ai-evaluation.md](../ai/m4-ai-evaluation.md)).

## Consequences
- The measures for both attacks ship in the US-01 and US-11 pull requests (ADR 0007, ADR 0008, ADR 0005).
- Writing the session-hijacking section turned up one issue nobody had listed: invite tokens were being
  written to the request log. Fixed with US-01.
- The threat model names what is still open (ID-token revocation, unauthenticated floods, mass account
  creation) so the next milestone can pick from that list instead of rediscovering it.
