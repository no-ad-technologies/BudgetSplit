# Milestone 3 · AI component part 2: AI-generated tests, evaluated against seeded bugs

Function under test: `splitByPercent` in [`apps/api/src/modules/expenses/split.ts`](../../apps/api/src/modules/expenses/split.ts)
(US-04). Reproduce everything below with `npm run test:seeded-bugs -w @budgetsplit/api`.

## Method

1. **Generate.** The prompt below went to an LLM (Claude Opus 5.5, 2026-11-03) together with the source of
   `splitByPercent` and its two guard helpers. Its answer is committed verbatim (only a header comment
   added) as [`apps/api/test/split.percent.ai.test.ts`](../../apps/api/test/split.percent.ai.test.ts):
   22 tests, all passing on the correct code. This happened **before** the partition table existed and
   **before** any seeded bug was chosen (see commit order on `feature/US-04-percent-custom-splits`).
2. **Design by hand.** The partition-driven tests come from the equivalence-partitioning table in
   [docs/testing/equivalence-partitioning.md](../testing/equivalence-partitioning.md):
   [`apps/api/test/split.percent.test.ts`](../../apps/api/test/split.percent.test.ts), 27 tests.
3. **Seed bugs.** [`apps/api/scripts/seeded-bugs.mjs`](../../apps/api/scripts/seeded-bugs.mjs) plants one
   bug at a time in `split.ts`, runs both test files, and restores the file. **S1 is the primary seeded
   bug**; S2–S9 are a wider sample so the comparison doesn't rest on a single case.

> Transparency note: both test files in this experiment were written with an AI assistant. The
> comparison is between two methods: one-shot generation from source code, and tests derived case by
> case from a partition table.

### Prompt

> Write a thorough Vitest unit-test suite for the TypeScript function below. Import it with
> `import { splitByPercent } from "../src/modules/expenses/split.ts";`. Cover normal cases, edge cases and
> invalid input. Constants: `MAX_EXPENSE_CENTS = 1_000_000`, `FULL_PERCENT_BASIS_POINTS = 10_000`.
>
> *(followed by the source of `Share`, `PercentAllocation`, `assertAmount`, `assertDistinctMembers` and
> `splitByPercent`, including its doc comment)*

## The primary seeded bug (S1)

```diff
-    hasFraction: (amountCents * basisPoints) % FULL_PERCENT_BASIS_POINTS !== 0,
+    hasFraction: basisPoints > 0,
```

The leftover cent now goes to the first member with any non-zero percentage, even when that member's
exact share is already a whole number of cents. On $10.05 split 20 / 30 / 50, the first member's exact
share is exactly $2.01, but the buggy code charges $2.02. It's a realistic bug: it is the most natural
reading of the story text ("leftover cents are assigned in join order, as in US-03") plus "skip people at 0%".

**Did the AI-generated tests catch it? No: 22 of 22 still pass.** The hand-designed tests catch it
twice: V7 (a whole exact share, first in join order, with a leftover) and the V10 property test.

The AI tests even contain the right check. Their "within one cent of its exact value" test would fail
on S1, but they only ever try one set of percentages (12.34 / 43.21 / 44.45%) and none of their inputs
produces a whole exact share alongside a leftover cent. **The oracle was fine; the inputs never reached
the partition.**

## All seeded bugs

First run, before fixing anything:

| Bug | AI-generated (22 tests) | Hand-designed (27 tests) |
| --- | --- | --- |
| **S1** Leftover cent goes to any member with a non-zero percentage, even if their exact share is already whole | **missed** | caught (V7, V10) |
| S2 Leftover cents go to the first members in join order, like US-03 (0% members included) | caught | caught |
| S3 Leftover cents handed out from the last member instead of the first | caught | caught |
| S4 `Math.round` instead of `Math.floor` for the base share | caught | caught |
| S5 Total check tolerates ±1 basis point (99.99% and 100.01% accepted) | caught | caught |
| S6 Off-by-one on the maximum: $10,000.00 itself rejected | caught | caught |
| S7 Fractional basis points accepted | caught | caught |
| S8 Negative percentages accepted | **missed** | **missed** |
| S9 Duplicate members accepted | caught | caught |
| **Caught** | **7 / 9** | **8 / 9** |

S8 slipped past both suites for the same reason: each "negative percentage" test also contained a
percentage over 100% (AI: −10% / 110%; hand: −0.01% / 100.01%), so the over-100% check threw first and
the test passed with the negative check deleted. That breaks the basic partitioning rule of one invalid
class per test case. We fixed the hand-designed I6 to −0.01% / 50% / 50.01% (only one rule broken).

Second run, after that fix: **AI-generated 7 / 9, hand-designed 9 / 9.** The AI file was left unchanged
on purpose, since it is the thing being evaluated.

## Partitions the AI tests covered and missed

Mapped onto the rows of the [partition table](../testing/equivalence-partitioning.md):

| Partition | AI-generated | Hand-designed |
| --- | --- | --- |
| V1 amount boundaries (1 cent, $10,000.00) | ✓ | ✓ |
| V2 one member at 100% | ✓ | ✓ |
| V3 / V4 several members, no leftover | ✓ | ✓ |
| V5 leftover given in join order | ✓ (doc-comment example, 33.33% × 3) | ✓ |
| V6 member at 0% first in join order, with a leftover | ✓ | ✓ |
| **V7 whole exact share first in join order, with a leftover** | **✗ missed** | ✓ |
| **V8 percentage worth under one cent receives a cent** | **✗ missed** | ✓ |
| V9 order and ids preserved | ✓ | ✓ |
| V10 property over the valid space | partial: one allocation, 3 members, 9 amounts | 2,000 seeded-random splits, 1–12 members |
| I1–I3 bad amounts (0, −1, fraction, NaN, ∞, 1,000,001) | ✓ | ✓ |
| I4 empty, I5 duplicate | ✓ | ✓ |
| **I6 negative percentage, isolated** | **✗ masked by I7** | ✓ after the fix |
| I7 over 100% | ✓ (but can't be isolated, see table) | ✓ asserts the message |
| I8 fractional basis point | ✓ | ✓ |
| I9 / I10 total 99.99% / 100.01% | ✓ | ✓ |

## What we take from it

- **Where the AI was strong:** fast (about a minute, versus designing the table), readable test names,
  and good at input-side boundaries it could see in the code: 0, −1, 1,000,001, NaN, ∞, totals of
  9,999 and 10,001.
- **Where it was weak:** output-side partitions, meaning which member receives a leftover cent. These
  only show up if you reason about the rule's consequences (V7, V8), not by reading the guard clauses.
  Its property test had the right assertion but too little input variety to reach the bug.
- **Shared blind spot:** both suites violated "one invalid class per test case" in the same way. The
  seeded bug found a flaw in our own tests, not just in the AI's.
- **How we'll use AI test generation from now on:** as a first draft that we then check against the
  partition table, row by row. And every property test needs varied inputs, not one fixed allocation.
