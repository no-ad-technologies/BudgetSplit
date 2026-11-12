# BudgetSplit

[![CI](https://github.com/no-ad-technologies/BudgetSplit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/no-ad-technologies/BudgetSplit/actions/workflows/ci.yml)

Shared-expense splitter for roommates and trips: log an expense, split it, and always know who owes whom.
Software engineering course project by **Rick Daniel, Samuel Mendoza and James Hays**.

> **Milestone 3 status:** MVP core features built in increments. Create a group and invite roommates with a link
> (US-02), split expenses evenly, by percentage or by custom amounts (US-03, US-04), see balances on every screen
> (US-05), get the fewest payments to settle up (US-06) and confirm each payment on both sides (US-07).
> D3 evidence: [docs/m3-report.md](docs/m3-report.md).
>
> **Milestone 4:** real sign-in (US-01): the deployed API accepts only Firebase ID tokens
> ([ADR 0007](docs/adr/0007-firebase-id-tokens.md), setup in [docs/auth-setup.md](docs/auth-setup.md)).

## Repository layout

```
apps/
  api/        Node 22 + Express 5 + Prisma ORM 7 (PostgreSQL). Modular monolith, Docker image for Render.
  mobile/     Expo SDK 57 / React Native 0.86 app (TypeScript).
packages/
  shared/     API contract types and money helpers used by both apps.
docs/         Architecture, ADRs, branching workflow, backlog, walking-skeleton evidence, D3 report,
              testing (equivalence partitioning), refactoring log, AI logs.
scripts/      Board bootstrap (GitHub issues + project), local DB init.
.github/      CI workflow, PR template, user-story issue form.
render.yaml   Production deployment as code (Render Blueprint).
```

## Quick start (local)

Prerequisites: **Node 22** (`.nvmrc`), **Docker Desktop**, and the **Expo Go** app on your phone.

```bash
npm install                      # installs all workspaces and generates the Prisma client
docker compose up -d db          # Postgres 17 on localhost:5432 (creates budgetsplit + budgetsplit_test)
cp apps/api/.env.example apps/api/.env
npm run db:migrate               # apply migrations to the dev database
npm run db:seed                  # demo group "Maple St House": Maya, Josh, Priya, Sam (+ Riley, not a member)
npm run dev:api                  # API on http://localhost:4000  (try GET /health)
```

In a second terminal, run the app:

```bash
cp apps/mobile/.env.example apps/mobile/.env.local   # set EXPO_PUBLIC_API_URL to your laptop's LAN IP
npm run dev:mobile                                   # scan the QR code with Expo Go
```

With no Firebase key set, the app runs in dev mode as the seeded user Maya. To use real sign-in, follow
[docs/auth-setup.md](docs/auth-setup.md).

Try the API without the app (local `AUTH_MODE=dev`):

```bash
curl http://localhost:4000/groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/balances \
  -H "X-User-Id: 11111111-1111-4111-8111-111111111111"

curl -X POST http://localhost:4000/groups/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/expenses \
  -H "X-User-Id: 11111111-1111-4111-8111-111111111111" -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-0001" \
  -d '{"description":"Groceries","amountCents":5000,"paidById":"11111111-1111-4111-8111-111111111111"}'
```

## Tests and checks

```bash
npm run typecheck    # all three workspaces
npm test             # shared (49), mobile (47), API (254: unit + integration against budgetsplit_test)
npm run test:seeded-bugs -w @budgetsplit/api   # D3 experiment: 9 seeded bugs vs AI-generated and hand-designed tests
npm run eval:ai -w @budgetsplit/api            # live AI evaluation + injection probes (needs ANTHROPIC_API_KEY)
```

The API integration tests empty the test database before each test and refuse to run against any database whose
name doesn't contain `test`.

## API

| Method | Path | Story | Notes |
| --- | --- | --- | --- |
| GET | `/health` | — | Render health check; reports database reachability |
| GET | `/users/me` | US-01 | The account behind the token; created on first sign-in |
| GET | `/users/me/groups` | US-05 | Home screen: my groups in join order, my net in each |
| POST | `/groups` | US-02 | Create a group; the creator is its first member and admin |
| GET | `/groups/:groupId` | US-02 | Group and members in join order |
| GET, POST | `/groups/:groupId/invites` | US-02 | Admins: list active invites / create a 7-day `budgetsplit://join/<token>` link |
| DELETE | `/groups/:groupId/invites/:inviteId` | US-02 | Admins: revoke an invite early |
| POST | `/invites/:token/accept` | US-02 | Join the group behind an invite (201, or 200 if already a member) |
| GET | `/groups/:groupId/balances` | US-05, US-07 | Net per member, counting confirmed settlements; always sums to 0 |
| GET | `/groups/:groupId/expenses?limit=20` | US-03 | Newest first |
| POST | `/groups/:groupId/expenses` | US-03, US-04 | `split`: `EVEN` (default), `PERCENT` (basis points) or `EXACT` (cents); `Idempotency-Key` makes retries safe |
| GET | `/groups/:groupId/settle-up` | US-06 | Fewest payments that clear every balance (exact up to 12 people) |
| GET | `/groups/:groupId/summary?days=30` | US-11 | Paid / own-share totals for 30 or 90 days, plus an AI-written summary when available |
| GET, POST | `/groups/:groupId/settlements` | US-07 | List (`?status=PENDING`) / record "I paid X" as pending |
| POST | `/groups/:groupId/settlements/:id/confirm`, `/reject` | US-07 | Receiver only; reject needs a `reason` |

Every route except `/health` needs `Authorization: Bearer <Firebase ID token>` and returns 401 without a valid one
(US-01). Locally, with `AUTH_MODE=dev`, the API accepts an `X-User-Id` header instead, as in the examples above;
production refuses to start in that mode. Group routes return 403 to non-members.
Each signed-in user gets 120 requests a minute, then `429` with `Retry-After` ([ADR 0008](docs/adr/0008-per-user-rate-limit.md)).
Errors always look like `{ "error": { "code", "message", "details?" } }`.

## AI feature: contribution summary (US-11)

The group screen can summarize who paid for what over the last 30 or 90 days. The server computes every
number; a hosted model (Anthropic `claude-haiku-5-5`) only puts them into two to four neutral sentences.
It receives aliases ("Member A") and totals, never names, emails or expense descriptions
([ADR 0005](docs/adr/0005-llm-privacy.md)), and its answer is checked before anyone sees it. Set
`ANTHROPIC_API_KEY` to turn it on; without it the numbers are shown on their own.
Prompt-injection testing and the evaluation set: [docs/ai/m4-ai-evaluation.md](docs/ai/m4-ai-evaluation.md).

## How we work

- **Branching:** GitHub Flow — short-lived `feature/US-xx-…` branches, PR + 1 review + green CI, squash merge. See [docs/branching.md](docs/branching.md).
- **Board:** GitHub Project "BudgetSplit board", created from [docs/board/backlog.json](docs/board/backlog.json) with `node scripts/bootstrap-board.mjs`.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs on **every push to every branch** and on every PR — API (typecheck, migrate, test, build, audit), shared + mobile (typecheck, test, Metro bundle), Docker image build.
- **Deploy:** Render Blueprint in [render.yaml](render.yaml); `main` deploys only after CI passes.
- **Decisions:** [docs/adr/](docs/adr/) and [CHANGELOG.md](CHANGELOG.md). Architecture overview: [docs/architecture.md](docs/architecture.md).
- **Security:** threat model (session hijacking and denial of service) in [docs/security/threat-model.md](docs/security/threat-model.md).
