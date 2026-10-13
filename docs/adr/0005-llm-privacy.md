# ADR 0005 · The LLM sees aliases and totals, never raw expenses

- **Status:** Accepted · 2026-10-13 (implemented with US-11)

## Context
The AI fairness summary (US-11) uses a hosted LLM. Raw expense rows contain names, stores and habits of people who
never agreed to share them with a third party (security ranks above the richness of the summary, trade-off T4).

## Decision
- The server computes contribution statistics itself and sends the model only aliases ("Member A") and numbers.
- The model is asked to describe amounts, not motives. The server rejects a summary containing any number that is not
  in the statistics it sent, and falls back to the plain table.
- Calls go through a provider-neutral `LlmClient` adapter with a 10-second timeout; failure shows "Summary unavailable".
- The client maps aliases back to first names after the response.

## Consequences
Summaries can't mention specific purchases. Swapping LLM providers touches one adapter.
