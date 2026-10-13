# ADR 0001 · One modular-monolith API, no microservices

- **Status:** Accepted · 2026-10-13 (Milestone 2)
- **Deciders:** Rick Daniel, Samuel Mendoza, James Hays

## Context
Settlement, AI insights and reminders could each be their own service (Ch. 6). We are three part-time
developers with one semester, and our highest-ranked quality attributes are reliability and maintainability.

## Decision
Ship one Node/Express API as a single Docker image. Each domain area is a module under
`apps/api/src/modules/<name>/` with its own routes, service and tests. Modules call each other in-process
through their exported service functions only; outside services (LLM, push, auth) sit behind adapters.

## Consequences
- One deploy, one CI pipeline, one log stream, no network calls between our own components.
- A slow or CPU-heavy module shares the process with expense entry (trade-off T3). Mitigation: timeouts on
  external calls; the AI summary runs off the request path.
- A module can be extracted into its own service later because its boundary is already an interface.
