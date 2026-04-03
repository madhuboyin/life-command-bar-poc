FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/flows/package.json packages/flows/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @lcb/shared build
RUN pnpm --filter @lcb/flows build
RUN pnpm --filter @lcb/worker build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/worker/dist apps/worker/dist
COPY --from=builder /app/apps/worker/node_modules apps/worker/node_modules
COPY --from=builder /app/apps/worker/package.json apps/worker/package.json
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/packages/flows/dist packages/flows/dist
COPY --from=builder /app/packages/flows/package.json packages/flows/package.json

CMD ["node", "apps/worker/dist/worker.js"]
