# Milestone 2 · AI component: LLM architecture proposal, critique, collaboration log

Copy kept in the repo so it is versioned with the code. The graded version is in the Milestone 2 document.

## Prompt

> You are a senior software architect reviewing a student team's project. Below is our product proposal for
> BudgetSplit, a mobile shared-expense splitter. [Proposal PDF attached.] Propose a software architecture for it.
> We are three college students with one semester, using TypeScript, React Native, Node/Express and PostgreSQL.
> Include: (1) the main components and how they communicate; (2) the deployment model: cloud platform, containers,
> and whether any part should be a separate service; (3) how data is stored; (4) the quality attributes you would
> prioritize and why; (5) at least two trade-offs between conflicting quality attributes, saying which you would
> optimize and what you would give up.

## The LLM's proposal (Claude Opus 5.5, 2026-10-13, in full)

**1. Components.** A React Native (Expo) client talks to a single REST API built with Node.js and Express. Organize the
API as a modular monolith with modules for auth, groups, expenses, balances, settlement and insights. For real-time sync
across members' phones, add a WebSocket channel (Socket.IO) that pushes balance updates to everyone in a group when an
expense changes. Use Redis for pub/sub between API instances and to cache computed balances. The client keeps a local copy
of group data in AsyncStorage and queues writes while offline, syncing when the connection returns.

**2. Deployment.** Containerize the API with Docker and deploy it on Render or Railway with managed PostgreSQL. Run
background work (reminders, recurring expenses, AI summaries) through a BullMQ job queue backed by Redis, in a separate
worker process. Keep the AI summary as a separate small service so its latency and API costs can be managed independently.
Use Firebase Cloud Messaging for push and Firebase Auth or Auth0 for sign-in. Run lint and tests in GitHub Actions on each
pull request and deploy on merge to main.

**3. Data.** PostgreSQL with Prisma: users, groups, group_members, expenses, expense_splits and settlements. Store money as
DECIMAL(10,2) to avoid floating-point errors. Compute balances with SQL aggregation and cache them in Redis.

**4. Quality attributes.** Reliability and data consistency, because balances must be correct; usability, because adding
an expense should take seconds; performance and scalability, through real-time updates and caching; security, through
authentication, HTTPS and input validation.

**5. Settlement and AI.** Use the greedy minimum-cash-flow algorithm: compute each person's net balance, then repeatedly
have the largest debtor pay the largest creditor. This minimizes the number of transactions. For pattern detection, send
the group's recent expense history to an LLM API (such as GPT-4o-mini or Claude Haiku) with a prompt asking for a
friendly, non-judgmental summary, and cache it per group for 24 hours.

**6. Trade-offs.** *Consistency vs. availability:* allow offline entry and optimistic updates so the app feels instant,
accepting short periods where members see different balances; resolve conflicts with last-write-wins. *Simplicity vs.
scalability:* a modular monolith instead of microservices gives up independent scaling but speeds development; extract the
AI service first if needed. *Cost vs. performance:* use free tiers and accept cold starts in exchange for $0 hosting.

## Critique

### Where it is sound
- Modular monolith over microservices (same reasoning as our T3, ADR 0001).
- PostgreSQL with Prisma, server-side SQL balances, an exact money type instead of floats.
- Managed sign-in instead of storing passwords (we chose Firebase Auth, ADR 0004).
- Docker on Render with managed Postgres and GitHub Actions.
- LLM call kept off the expense-entry path and cached.

### Where it is hand-wavy
- **"Greedy … minimizes the number of transactions" is false.** Greedy finishes in at most n−1 payments but not the
  fewest. Nets +$6, +$4, +$3, −$6, −$7: greedy makes 4 payments; 3 suffice (−$6 pays +$6; −$7 pays $4 and $3).
  The true minimum is NP-hard in general, and our vision promises "the fewest transactions possible."
- **WebSockets + Redis** is sized for a chat app. Open sockets fight Render's free-tier spin-down (15 idle minutes);
  Render's free Redis-compatible store is in-memory only and the smallest persistent one is $10/month.
- **Caching balances in Redis** adds invalidation bugs to our most important number to save two indexed queries.
- **Offline queue + last-write-wins** silently drops a roommate's expense on conflict and ignores duplicate retries.
- **DECIMAL(10,2)** is right in the database but says nothing about exactness in JavaScript or who gets the extra cent.
- Recommends a monolith, then a separate AI service and worker, without justifying the extra deployables.
- Lists quality attributes without ranking them; "scalability" has no load estimate behind it.

### What it missed about our priorities
- Reliability: no leftover-cent rule, no sum-to-zero check, no database constraints on money.
- Reliability under bad networks: no idempotency, so a retry can log the same dinner twice.
- Security and trust: no membership check on group routes, no two-sided settlement confirmation (US-07), no audit trail.
- Privacy: raw expense history (names, purchases) goes to a third party; nothing stops invented numbers (T4).
- Hosting: free Render Postgres expires after 30 days with no backups.
- Delivery: CI without migrations; deploys not gated on checks.

### What we changed because of it
- ADR 0006 and US-06 criteria: exact plan for groups of up to 12, greedy (labelled "suggested") above.
- ADR 0005 and US-11 criteria: aliases and totals only; server rejects summaries with numbers it didn't send.
- No Redis, WebSockets or job queue; a Render cron job from the same image handles scheduled work.

## Collaboration log

| # | Date | Who | Prompt or action | What came back | What we kept |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-13 | James with Claude | Shared the proposal PDF and M2 brief; asked Claude to complete Milestone 2 | The M2 document, this repo scaffold, CI, the walking skeleton and tests | Pending team review |
| 2 | 2026-10-13 | Claude | Ran the architecture prompt above | The proposal above | Monolith, Postgres, managed auth, Docker on Render |
| 3 | 2026-10-13 | Claude, for team review | Critiqued it against our quality ranking | The critique above | ADR 0006, new US-06 criteria |
| 4 | 2026-10-13 | Claude | Checked Render limits, prices and Blueprint syntax on render.com | 30-day free Postgres, $6 database, checks-gated deploys | Paid database from day one |
| 5 | 2026-10-13 | Claude | Ran all tests, built the Docker image, captured app screens | 68 tests passing; see docs/walking-skeleton.md | — |

The proposal came from the same Claude session that drafted the milestone, so it is not fully independent of our design.
Re-run the prompt in a fresh chat or another model before submitting, add new findings to the critique, and log every other
AI session the team used.
