FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/flows/package.json packages/flows/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @lcb/shared build
RUN pnpm --filter @lcb/flows build
RUN pnpm --filter @lcb/api exec prisma generate
RUN pnpm --filter @lcb/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=4000

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/api/dist apps/api/dist
COPY --from=builder /app/apps/api/node_modules apps/api/node_modules
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/prisma apps/api/prisma
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/packages/flows/dist packages/flows/dist
COPY --from=builder /app/packages/flows/package.json packages/flows/package.json

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
