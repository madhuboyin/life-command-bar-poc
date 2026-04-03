FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/flows/package.json packages/flows/package.json
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --filter @lcb/worker... --frozen-lockfile=false

FROM base AS builder
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @lcb/worker build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/worker/dist apps/worker/dist
COPY --from=builder /app/apps/worker/package.json apps/worker/package.json
COPY --from=builder /app/node_modules node_modules

CMD ["node", "apps/worker/dist/worker.js"]