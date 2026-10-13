# BudgetSplit API image. Build from the REPO ROOT (it needs the workspace lockfile):
#   docker build -f apps/api/Dockerfile -t budgetsplit-api .
# The same Dockerfile is built by CI on every pull request and by Render on every deploy.

ARG NODE_IMAGE=node:22-bookworm-slim

# ---- build: install all API deps, generate the Prisma client, bundle with esbuild ----
FROM ${NODE_IMAGE} AS build
WORKDIR /repo
# Every workspace manifest is needed for `npm ci` to accept the lockfile, even the mobile one.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @budgetsplit/api --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run db:generate -w @budgetsplit/api && npm run build -w @budgetsplit/api

# ---- runtime: production deps only, the bundle, and the migrations ----
FROM ${NODE_IMAGE} AS runtime
# Prisma's migration (schema) engine needs OpenSSL, which the slim image doesn't ship.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1 \
    PATH=/repo/node_modules/.bin:$PATH
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
# Install scripts stay off except for Prisma's, which downloads the schema engine used by
# `prisma migrate deploy`. It must happen here, as root: the app runs as the unprivileged node user.
RUN npm ci --workspace @budgetsplit/api --omit=dev --ignore-scripts \
 && npm rebuild prisma @prisma/engines \
 && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/

WORKDIR /repo/apps/api
USER node
EXPOSE 4000
# Apply pending migrations, then replace the shell with Node so it receives SIGTERM directly.
CMD ["sh", "-c", "prisma migrate deploy && exec node dist/server.js"]
