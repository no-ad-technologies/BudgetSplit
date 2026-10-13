# ADR 0002 · Render (PaaS) with a Docker image, managed Postgres

- **Status:** Accepted · 2026-10-13

## Context
We need HTTPS hosting, a managed database and Git-based deploys without running servers (Ch. 5).
The proposal named Render or AWS.

## Decision
Render, defined as code in `render.yaml`: a Docker web service built from `apps/api/Dockerfile`, a Render
Postgres 17 database on the `0.1c-256mb` plan ($6/month), both in Ohio. The web service uses the Free plan
during development and Starter (`0.5c-512mb`, $7/month) during demo weeks. Deploys run only after GitHub
checks pass (`autoDeployTrigger: checksPass`). Migrations run when the container starts.

## Consequences
- The image CI builds is the image Render runs; local `docker compose --profile full up` runs it too.
- Free web services spin down after 15 idle minutes and take about a minute to wake (accepted for development).
- Render's free Postgres expires after 30 days with no backups, so the database is paid from day one.
- Leaving Render means moving one Dockerfile and one Postgres dump; nothing is Render-specific in the code.

Sources: https://render.com/docs/free, https://render.com/pricing, https://render.com/docs/blueprint-spec (checked 2026-10-13).
