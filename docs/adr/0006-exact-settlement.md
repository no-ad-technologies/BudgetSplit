# ADR 0006 · Exact fewest-payments settlement for groups up to 12 people

- **Status:** Accepted · 2026-10-13 (implemented with US-06)

## Context
The proposal promises settling a group "in the fewest transactions possible." The common greedy approach (largest
debtor pays largest creditor) always finishes in at most n − 1 payments but is not always minimal. Finding the true
minimum is equivalent to splitting members into as many zero-sum subgroups as possible, which is NP-hard in general.
This came out of our critique of the LLM's architecture proposal (Milestone 2, AI component).

## Decision
For groups of up to 12 members, compute the exact minimum with a dynamic program over subsets (2^12 = 4,096 subsets).
Above 12 members, fall back to the greedy plan, which guarantees at most n − 1 payments, and label it "suggested"
rather than "fewest". Both are pure functions with property tests: applying the plan zeroes every balance.

## Consequences
The "fewest payments" claim is true for every realistic roommate or trip group, and the limit is explicit.
