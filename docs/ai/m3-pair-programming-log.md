# Milestone 3 · AI component part 1: AI as pair programmer

**Assistant:** Claude (Claude Opus 5.5), working in a cloud workspace with the repo cloned, the full test suite
and a local PostgreSQL. **Used on:** every Deliverable 3 feature (US-02, US-04, US-06, US-07), the
refactors and the tests. The assistant drafted code and tests; nothing was merged without the full suite
passing locally, and every commit stays on a branch for team review before any PR.

Rule we followed: **a green test only counts once you've seen it fail.** Several entries below were
found because of that rule.

## Where it sped us up

| Area | What the assistant did | Why it was faster |
| --- | --- | --- |
| US-06 exact settle-up (ADR 0006) | Wrote the subset dynamic program, an independent brute-force checker for groups of up to 8, and a random search that found a concrete case where greedy is not minimal: balances $7 / −$6 / $1 / −$5 / −$7 / $10 take 5 payments greedy, 4 exact. That case is now a regression test. | Turning "NP-hard in general, exact for ≤ 12" into working, cross-checked code was the riskiest item on the board. It took one sitting. |
| Boilerplate per story | Prisma models and migrations (with hand-written CHECK constraints), zod schemas, shared DTOs and supertest suites, all following the patterns already in the repo (idempotency keys, composite FKs, `{ error: { code } }`). | Each story's API layer went from schema to green integration tests in one pass. |
| Test design for races | Proposed concurrency tests for settlement confirmation and group joins, and a probe that measured how often the join race fails without a lock (9 of 10 rounds). | We wouldn't have measured it; we'd have guessed. |
| Seeded-bug harness | `apps/api/scripts/seeded-bugs.mjs` plants 9 bugs one at a time and runs both test suites (part 2 of the AI component). | Makes the experiment re-runnable by anyone on the team in one command. |
| UI checks without a phone | Exported the app for the web temporarily and took phone-width screenshots of every new screen with Playwright. | Found two layout and wording bugs that typecheck and unit tests can't see (entries 6 and 7 below). |

## Bugs and bad suggestions caught

All of these were in the assistant's own first drafts. #1–#4 were caught before committing. #5, #6 and #7
were committed first and fixed in later commits (`f65f8e6`, `381923e`), which is visible in the branch history.

| # | Story | The AI's draft | How it was caught | Fix |
| --- | --- | --- | --- | --- |
| 1 | US-06 | A feature test asserted `expect(readable(body)).toEqual(cond ? readable(body) : [])`, which compares the result with itself and can never fail. Its comment also claimed the new expense "cancels Sam's and Priya's debts", which was false. | Code review before committing: the assertion didn't name an expected value. | Worked the balances out by hand (Maya +7.45, Josh −7.45, Priya −52.54, Sam +52.54) and asserted the exact plan: Josh pays Maya $7.45, Priya pays Sam $52.54. |
| 2 | US-02 | Mounted group creation as `app.post("/groups", devAuth, routerWithPost("/"))`. `app.post` doesn't strip the path the way `app.use` does, so the inner route would never match: every "create group" would be a 404. | Self-review before running tests. | A plain request handler (`createGroupHandler`). |
| 3 | US-02 | The "two taps on the invite link" race test sent 2 requests at once and passed, **but it also passed with the row lock deleted**. The requests never actually overlapped, so the test proved nothing. | Deliberately deleting the lock (`SELECT … FOR UPDATE`) and re-running. | Probe: 6 concurrent joins without the lock gave 500s in 9 of 10 rounds. The test now runs 3 rounds × 6 concurrent joins; it fails without the lock and passes with it. |
| 4 | US-02 | First design used a `SERIALIZABLE` transaction to keep the 50-member cap exact. Under contention Postgres aborts one transaction (error 40001), so the user would see an error and the code would need a retry loop. | Design review while writing the join code. | Lock the group row instead: concurrent joins queue rather than fail. |
| 5 | US-04 | The "negative percentage" test used −1 / 10,001 basis points, which breaks **two** rules at once. The over-100% check threw first, so the test passed even with the negative check deleted. (The AI-generated tests made the same mistake.) | Seeded bug S8 survived both test suites (part 2). | One invalid class per test: −1 / 5000 / 5001. Partition table updated to explain why I7 can't be tested alone. |
| 6 | US-02 | "Create" and "Join" buttons pushed past the card's edge on a 390-pt-wide phone: a text input in a row won't shrink below its intrinsic width. | Phone-width screenshot. | `minWidth: 0` on the input. |
| 7 | US-07 | While Priya's payment was pending, Maya's settle-up card still said "Priya pays you $26.27" with nothing tying it to the pending card, so it looked like she owed it twice. | Phone-width screenshot. | Any plan row that matches a pending settlement shows "Pending" for everyone, not just the payer. |
| 8 | Tooling | Rebuilding the app with a different `EXPO_PUBLIC_DEV_USER_ID` kept the old user: Metro's cache had inlined the previous value. | The screenshot still said "Signed in as Maya". | Use `npx expo export --clear` when changing `EXPO_PUBLIC_*` variables. |

## Where we did **not** take the AI's word for it

- **Expo / React Native APIs.** `apps/mobile/AGENTS.md` warns that Expo changes every SDK release.
  Before using `Share` from React Native, we checked that React Native 0.86.3 in `node_modules`
  still exports it. Everything else in the new screens uses only core components we already used.
- **"Leftover cents in join order, as in US-03".** Taken literally, this story text charges an extra
  cent to a member whose exact share is already whole (on $10.05 at 20 / 30 / 50%, the first member's
  exact share is $2.01, so they shouldn't pay $2.02). We gave leftover cents only to members whose share
  has a fraction, and used the literal reading as seeded bug S1.
- **Every concurrency guard was checked by breaking it.** Removing `status: "PENDING"` from the confirm
  update fails the double-confirm and race tests. Removing the row lock fails the join race test.

## What we'd do differently

Ask for the failing case first: for every guard (lock, conditional update, validation rule), write or
run the test against the code **without** the guard before trusting a green run. Entries 3 and 5 are
exactly the cases where a green test was lying.
