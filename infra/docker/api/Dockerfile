FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/flows/package.json packages/flows/package.json
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --filter @lcb/api... --frozen-lockfile=false

FROM base AS builder
COPY . .
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @lcb/api exec prisma generate
RUN pnpm --filter @lcb/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=4000

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/prisma apps/api/prisma
COPY --from=builder /app/node_modules node_modules

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]