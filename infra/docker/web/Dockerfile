FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --filter @lcb/web... --frozen-lockfile=false

FROM base AS builder
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @lcb/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/web/.next apps/web/.next
COPY --from=builder /app/apps/web/public apps/web/public
COPY --from=builder /app/apps/web/package.json apps/web/package.json
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/web/next.config.js apps/web/next.config.js

EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "apps/web", "-p", "3000"]