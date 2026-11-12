# ADR 0005 · The LLM sees aliases and totals, never raw expenses

- **Status:** Accepted · 2026-10-13 · implemented 2026-11-12 (US-11), with the additions below

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

## As built (2026-11-12)
Code: `apps/api/src/modules/insights/`. Provider: Anthropic, model `claude-haiku-5-5`, called with plain
`fetch` through `LlmClient` (`llm.ts`).

- **Input.** `buildPromptPayload` (`prompt.ts`) is the only code that writes the model's input. It takes
  numbers and generated aliases; it has no parameter for a name, a group name or a description.
- **Output checks** (`validate.ts`). An answer is shown only if all of these hold: every dollar amount,
  percentage and count in it is one the server sent; every "Member X" is a real alias; it states at least
  one of the group's amounts; it has no judgemental or advisory wording; no link or markup; no text from
  the system prompt (detected by a canary string); at most 700 characters.
- **Cost and abuse limits.** Summaries are cached until the group's numbers change, and members asking at
  the same moment share one call. New model calls are capped at 5 per member and 10 per group per
  10 minutes, and 500 per day for the whole service (`quota.ts`, `LLM_DAILY_CALL_LIMIT`).
- **The key.** `ANTHROPIC_API_KEY` is a Render secret (`sync: false` in `render.yaml`). It is optional:
  without it the endpoint returns the numbers with `status: "unavailable"`.
- **Changed from the original decision:** percentages are whole numbers and "difference" is measured
  against a member's own share of the expenses, not an even share, so custom splits are not reported as
  imbalances.

Testing and evaluation: [docs/ai/m4-ai-evaluation.md](../ai/m4-ai-evaluation.md).
