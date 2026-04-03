# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Overview

pnpm workspace monorepo using Turborepo. Package manager: `pnpm@10.0.0`.

```
apps/
  api/      Express + TypeScript backend (port 4000)
  web/      Next.js 15 + React 19 frontend (port 3000)
  worker/   Background job processor (stub)
packages/
  @lcb/shared   Shared types and enums
  @lcb/flows    Resolution flow definitions per obligation type
database/   Migrations and seeds
infra/      Docker, Kubernetes, Terraform
docs/       Architecture docs and ADRs
```

## Commands

```bash
pnpm dev              # Start all apps in parallel
pnpm build            # Build all packages (respects dependency order)
pnpm lint             # ESLint across all apps
pnpm typecheck        # TypeScript type checking across all apps
pnpm format           # Prettier format

# API-specific (run from apps/api/)
pnpm prisma:migrate   # Run DB migrations (prisma migrate dev)
pnpm prisma:push      # Push schema without migration file
pnpm prisma:studio    # Open Prisma Studio DB UI
pnpm prisma:generate  # Regenerate Prisma Client

# Run a single app dev server
pnpm --filter @lcb/api dev
pnpm --filter @lcb/web dev
```

## Environment Variables

**API** (`apps/api/.env`):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lcb_poc
REDIS_URL=redis://localhost:6379
LLM_PROVIDER=openai
LLM_API_KEY=...
API_PORT=4000
```

**Web** (`apps/web/.env.local`):
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_LCB_USER_ID=usr_demo_001     # optional, falls back to this default
NEXT_PUBLIC_LCB_USER_EMAIL=...           # optional
```

## Architecture

### Auth
No login UI — auth is header-based. The API middleware (`apps/api/src/middleware/auth.middleware.ts`) reads `x-user-id` + `x-user-email` headers (or `Authorization: Bearer <user-id>`) and auto-upserts a User record. The web API client (`apps/web/src/lib/api.ts`) injects these headers on every request, defaulting to `usr_demo_001`.

### Backend Structure (apps/api/src/)
Routes → Controllers → Services → Repositories (Prisma) → PostgreSQL

- `routes/` — Express route definitions
- `controllers/` — Request handling, delegates to services
- `services/` — Core business logic (ObligationService, TodayFeedService, ResolutionService, DashboardInsightsService, etc.)
- `repositories/` — All Prisma queries isolated here
- `utils/obligation.mapper.ts` — Transforms DB entities to API response shapes

### API Response Envelope
All endpoints return:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "...", "details": {} } }
```

### Frontend (apps/web/src/)
Next.js App Router. API calls go through `lib/api.ts`, which resolves the base URL (handles localhost vs. production Cloudflare tunnel) and attaches auth headers. No client-side state management library — React state + fetch.

### Shared Types
`@lcb/shared` package defines the canonical TypeScript types and enums used by both API and web. Always import from here rather than defining locally.

### Resolution Flows
`@lcb/flows` package contains type-specific guidance flows (bill, subscription, renewal). Each flow returns `{ recommendation, whyItMatters, steps, primaryAction, secondaryAction }`. The API's `ResolutionService` invokes the appropriate flow and records it in the `ResolutionRun` table.

### Database Schema (Prisma, PostgreSQL)
Key models: `User`, `Obligation`, `Reminder`, `FeedbackEvent`, `AuditEvent`, `Upload`, `ImportSource`, `ResolutionRun`.

`Obligation` is the core domain entity with:
- `type`: BILL | SUBSCRIPTION | RENEWAL | COMMITMENT
- `status`: DRAFT | ACTIVE | POSTPONED | RESOLVED | IGNORED
- Scoring fields: `urgencyScore`, `importanceScore`, `confidenceScore`, `effortLevel`, `impactLevel`

### Today Feed Ranking
`TodayFeedService` ranks active obligations using a weighted score across urgency, importance, effort, and due date proximity. See `docs/today-feed-ranking.md` for the algorithm.

## Key Docs
- `docs/architecture.md` — System design
- `docs/architecture-decisions.md` — ADRs
- `docs/data-model.md` — Full schema reference
- `docs/resolution-flows.md` — Flow decision logic
- `docs/frd.md` / `docs/prd.md` — Requirements
