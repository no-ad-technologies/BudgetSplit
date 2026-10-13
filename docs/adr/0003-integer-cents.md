# ADR 0003 · Money is integer cents, and only the server does money math

- **Status:** Accepted · 2026-10-13

## Context
Floating-point dollars produce errors like 0.1 + 0.2 = 0.30000000000000004. A one-cent mismatch between two
phones would destroy trust in the app (reliability is our top attribute).

## Decision
- Every amount is an integer number of cents: in Postgres (`INTEGER`), in the API, in the shared types, and on the phone.
- Input like "12.50" is parsed with string math (`parseDollarsToCents`), never `parseFloat`.
- Even splits give `floor(amount / n)` to everyone and the leftover cents, one each, to members in join order.
- Balances are computed only on the server; every group's nets must sum to exactly zero or the API returns an error.
- The database enforces `0 < amount_cents <= 1,000,000` and `share_cents >= 0` with CHECK constraints.

## Consequences
Rounding is deterministic and testable, and the client cannot drift from the server. Displaying money always goes through `formatCents`.
