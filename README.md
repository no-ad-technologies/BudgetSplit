# BudgetSplit

Shared-expense splitter for roommates and trips: log an expense, split it, and always know who owes whom.
Software engineering course project by **Rick Daniel, Samuel Mendoza and James Hays**.

> **Milestone 2 status:** walking skeleton running end to end. On the phone you can see a group's balances and add
> an evenly split expense; the API validates it, splits it in integer cents, stores it in PostgreSQL in one
> transaction and returns the new balances.

## Repository layout

```
apps/
  api/        Node 22 + Express 5 + Prisma ORM 7 (PostgreSQL). Modular monolith, Docker image for Render.
  mobile/     Expo SDK 57 / React Native 0.86 app (TypeScript).
packages/
  shared/     API contract types and money helpers used by both apps.
docs/         Architecture, ADRs, branching workflow, backlog, walking-skeleton evidence.
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

Try the API without the app:

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
npm test             # shared (23), mobile (7), API (38: unit + integration against budgetsplit_test)
```

The API integration tests empty the test database before each test and refuse to run against any database whose
name doesn't contain `test`.

## API (walking skeleton)

| Method | Path | Story | Notes |
| --- | --- | --- | --- |
| GET | `/health` | — | Render health check; reports database reachability |
| GET | `/groups/:groupId` | US-02 (read only) | Group and members in join order |
| GET | `/groups/:groupId/balances` | US-05 | Net per member; always sums to 0 |
| GET | `/groups/:groupId/expenses?limit=20` | US-03 | Newest first |
| POST | `/groups/:groupId/expenses` | US-03 | Even split; `Idempotency-Key` header makes retries safe |

Every group route needs `X-User-Id` (dev auth stub until US-01) and returns 403 to non-members.
Errors always look like `{ "error": { "code", "message", "details?" } }`.

## How we work

- **Branching:** GitHub Flow — short-lived `feature/US-xx-…` branches, PR + 1 review + green CI, squash merge. See [docs/branching.md](docs/branching.md).
- **Board:** GitHub Project "BudgetSplit board", created from [docs/board/backlog.json](docs/board/backlog.json) with `node scripts/bootstrap-board.mjs`.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) — API (typecheck, migrate, test, build, audit), shared + mobile (typecheck, test, Metro bundle), Docker image build.
- **Deploy:** Render Blueprint in [render.yaml](render.yaml); `main` deploys only after CI passes.
- **Decisions:** [docs/adr/](docs/adr/) and [CHANGELOG.md](CHANGELOG.md). Architecture overview: [docs/architecture.md](docs/architecture.md).
