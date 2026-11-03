# Changelog

All notable changes to BudgetSplit. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Each entry names the story it serves, so any change can be traced back (and reverted) by story.

## [Unreleased]

### Added
- **US-04 · Split by percentage or custom amounts.** `POST /groups/:id/expenses` takes an optional
  `split` (`EVEN` | `PERCENT` | `EXACT`); percentages travel as integer basis points. Leftover cents go
  in join order to members whose exact share has a fraction of a cent, so a 0% member always pays $0.00.
  The mobile form has Evenly / By % / Amounts, shows what is left to assign, and keeps Save disabled
  until the shares add up. New error code `share_not_member`.
- **US-06 · Fewest payments to settle up.** `GET /groups/:id/settle-up` returns the exact minimum
  number of payments for up to 12 members with a balance (dynamic program over subsets, ADR 0006) and a
  greedy plan of at most n − 1 payments above that (`exact: false`). Settle-up card on the group screen.
- Equivalence-partitioning table for `splitByPercent` and `splitExact`
  ([docs/testing/equivalence-partitioning.md](docs/testing/equivalence-partitioning.md)).
- AI-generated tests for `splitByPercent`, evaluated against 9 seeded bugs with
  `npm run test:seeded-bugs -w @budgetsplit/api` ([docs/ai/m3-ai-generated-tests.md](docs/ai/m3-ai-generated-tests.md)).

### Changed
- Structured logging through pino (`apps/api/src/logger.ts`) replaces manual `console.log(JSON.stringify(...))`
  in `server.ts`, `requestLog.ts` and `errors.ts`; errors and stacks serialize automatically.
- Shared `ApiErrorCode` constants in `packages/shared` replace hardcoded error-code strings across the API,
  the mobile client and the tests.
- Safer type guards in `errors.ts` (`in`-operator for body-parser errors, `instanceof Error` for stack traces).
- Split `createEvenExpense` into `findReplay` and `resolveShares` helpers so the transaction holds only the
  writes and idempotency-critical reads.
- Mobile `GroupScreen` decomposed into `useGroupData`, `BalanceList` and `ExpenseForm`, with a shared `theme`.

## [0.1.0] - 2026-10-13 · Milestone 2: foundation and walking skeleton

### Added
- Monorepo with npm workspaces: `apps/api`, `apps/mobile`, `packages/shared`.
- API (Express 5, Prisma ORM 7, PostgreSQL): `GET /health`, `GET /groups/:id`, `GET /groups/:id/balances`,
  `GET` and `POST /groups/:id/expenses` with even splits in integer cents and idempotent retries (US-03, US-05).
- Database schema and first migration, with CHECK constraints on money columns and composite foreign keys that keep
  payers inside their group.
- Dev-only auth stub and real group-membership authorization (seam for US-01).
- Demo seed: "Maple St House" with Maya, Josh, Priya and Sam, plus Riley as a non-member.
- Expo app: one group screen showing balances and an add-expense form (US-03, US-05).
- Shared package: API contract types, `formatCents`, `parseDollarsToCents`, `describeNet`.
- Tests: 23 shared, 7 mobile, 38 API (unit and integration against a real Postgres test database).
- Dockerfile for the API, Docker Compose for local Postgres, Render Blueprint (`render.yaml`).
- GitHub Actions CI: API, shared + mobile (including a Metro bundle), Docker build.
- Board backlog (`docs/board/backlog.json`) and `scripts/bootstrap-board.mjs` for GitHub issues and Project.
- Docs: architecture, branching workflow, ADRs 0001–0006, walking-skeleton evidence.

### Decided
- Modular monolith, no microservices (ADR 0001); Render PaaS with Docker (ADR 0002); integer cents (ADR 0003);
  dev auth stub until Firebase Auth (ADR 0004); LLM privacy (ADR 0005); exact settlement up to 12 members (ADR 0006).
- Pinned Prisma ORM 7.10.0 (the `prisma` package's `latest` tag on npm points at an 8.0 release candidate).
- Pinned React 19.2.3 across the workspace with npm `overrides`: Prisma's CLI pulled in React 19.3.0, which would
  have put two copies of React into the mobile bundle.
