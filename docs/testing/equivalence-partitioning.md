# Equivalence partitioning · `splitByPercent` and `splitExact` (US-04)

Deliverable 3 requirement: unit tests with a documented equivalence-partitioning table for at least one
non-trivial function. Tests: [`apps/api/test/split.percent.test.ts`](../../apps/api/test/split.percent.test.ts).
Every row ID below is the prefix of a test name, so `npx vitest run -t "V7"` runs exactly that row.

## Why this function

`splitByPercent(amountCents, allocations)` decides how many cents each roommate pays when an expense is
split by percentage (US-04). It is non-trivial because the percentages almost never divide the amount
into whole cents, so it has to decide who absorbs the leftover cents, and a one-cent mistake is exactly
the kind of error that makes people stop trusting a shared ledger (reliability, ADR 0003).

**Specification** (from US-04 and the function's doc comment):

- `amountCents` is an integer from 1 to 1,000,000 ($0.01 to $10,000.00).
- `allocations` is a non-empty list of `{ userId, basisPoints }` in group join order, no member twice.
  Basis points are integers from 0 to 10,000 (1% = 100) and must total exactly 10,000 (100%).
- Each member gets `floor(amount × bp / 10,000)`. The leftover cents go one each, in join order, to
  members whose exact share has a fraction of a cent.
- So: shares always total the amount, each share is its exact value rounded down or up, a member at 0%
  pays $0.00, and a member whose exact share is already whole cents never gets an extra cent.

## Input and output conditions

| Condition | Valid classes | Invalid classes |
| --- | --- | --- |
| `amountCents` | integer in [1, 1,000,000] | ≤ 0; > 1,000,000; not an integer (fraction, NaN, ∞) |
| Number of members | 1; 2 to 12 | 0 (empty list) |
| Member ids | all distinct | a member listed twice |
| Each member's basis points | integer in [0, 10,000] | < 0; > 10,000; not an integer |
| Total basis points | exactly 10,000 | < 10,000; > 10,000 |
| Leftover cents (output) | 0 (every exact share whole); > 0 | — |
| Who can receive a leftover cent (output) | member with a fraction; member at 0% (must not); member with a whole exact share (must not); member worth under one cent (may) | — |

## Partition table

Boundary values are tested on both sides wherever a class has an edge.

| ID | Class | Valid? | Representative input | Expected output |
| --- | --- | --- | --- | --- |
| V1 | Amount at its boundaries | ✓ | 1 cent at 100%; 1,000,000 at 25/75 | `[1]`; `[250000, 750000]` |
| V2 | One member at 100% | ✓ | 4510 at 100% | `[4510]` |
| V3 | Several members totaling 100% | ✓ | 120,000 at 40/30/20/10 | `[48000, 36000, 24000, 12000]` |
| V4 | No leftover (all exact shares whole) | ✓ | 150,000 at 40/30/30 (rent) | `[60000, 45000, 45000]` |
| V5 | Leftover > 0, given in join order to members with a fraction | ✓ | 2 at 33.33/33.33/33.34 | `[1, 1, 0]` |
| V6 | Member at 0%, first in join order, leftover > 0 | ✓ | 999 at 0/50/50 | `[0, 500, 499]` (cent skips the 0% member) |
| V7 | Member with a whole exact share, first in join order, leftover > 0 | ✓ | 1005 at 20/30/50 | `[201, 302, 502]` (cent skips the whole share) |
| V8 | Non-zero percentage worth under one cent | ✓ | 100 at 0.01/99.99 | `[1, 99]` |
| V9 | Output order and ids | ✓ | sam 25%, maya 75% | ids `["sam", "maya"]` |
| V10 | Property over the whole valid space | ✓ | 2,000 seeded-random splits, 1–12 members | total = amount; each share is floor or ceil of exact (floor if exact is whole) |
| I1 | Amount zero or negative | ✗ | 0, −1 | `RangeError` |
| I2 | Amount over the maximum | ✗ | 1,000,001 | `RangeError` |
| I3 | Amount not an integer | ✗ | 12.5, NaN, ∞ | `RangeError` |
| I4 | No members | ✗ | `[]` | `RangeError` |
| I5 | Duplicate member | ✗ | maya twice | `RangeError` |
| I6 | Negative percentage (total still 100%) | ✗ | −1 / 10,001 bp | `RangeError` |
| I7 | Percentage over 100% | ✗ | 10,001 bp | `RangeError` |
| I8 | Fractional basis point | ✗ | 3333.5 / 3333.5 / 3333 | `RangeError` |
| I9 | Total just under 100% | ✗ | 5000 + 4999 = 9,999 | `RangeError` |
| I10 | Total just over 100% | ✗ | 5000 + 5001 = 10,001 | `RangeError` |

V6, V7 and V8 are the partitions that matter most for correctness. They sit on the output side (who gets
the leftover cent), not the input side, so a test plan that only partitions the inputs misses them.
See [docs/ai/m3-ai-generated-tests.md](../ai/m3-ai-generated-tests.md) for what happened when the
AI-generated tests were run against a seeded bug in exactly that area.

## Companion table · `splitExact` (custom amounts)

| ID | Class | Valid? | Representative input | Expected |
| --- | --- | --- | --- | --- |
| E1 | Shares total the amount, one member left out at $0.00 | ✓ | 9000 as 5000 / 4000 / 0 | returned as given |
| E2 | Total off by one cent (under, over) | ✗ | 5000 + 3999; 5000 + 4001 | `RangeError` naming both totals |
| E3 | Negative or fractional share, total still matches | ✗ | 9500 / −500; 4500.5 / 4499.5 | `RangeError` |
| E4 | No members; duplicate member | ✗ | `[]`; a twice | `RangeError` |

## How the API layer uses these partitions

The HTTP layer (`expenses.schema.ts`) rejects the invalid input classes first with `400 validation_failed`
and a readable message ("Percentages add up to 99.99%, not 100%"). The split functions keep their own
checks as a second line of defense, so a bug in validation can't store a wrong split; the database CHECK
constraints are the third (ADR 0003). The integration tests in `apps/api/test/splits.api.test.ts`
exercise V4, V6, I9 and E2 through the real API.
