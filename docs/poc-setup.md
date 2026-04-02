# Admin-First Life Command Bar (LCB-A) — POC Setup Guide

## 1. Purpose

This document explains how to set up and run the LCB-A POC locally and on a Raspberry Pi-based cluster.

The POC is designed to validate:

1. Today Feed usefulness
2. command bar interaction
3. obligation creation and persistence
4. resolution flow quality
5. feedback and reminder loops

This setup guide is intentionally optimized for speed, simplicity, and iteration rather than production hardening.

---

## 2. POC Scope

The POC should support the following capabilities:

1. manual obligation creation
2. optional upload or forwarded-email ingestion
3. Today Feed generation
4. top resolution flows
5. feedback capture
6. reminder creation
7. basic observability

The POC should not attempt:

1. autonomous financial execution
2. direct bank integrations
3. universal web automation
4. full inbox assistant behavior
5. heavy local AI inference on Raspberry Pi nodes

---

## 3. Recommended POC Topology

## 3.1 Application Split

### On the Raspberry Pi cluster

1. web app
2. API service
3. worker service
4. PostgreSQL
5. Redis
6. observability stack

### External / Hosted

1. LLM API
2. optional OCR/document parsing API
3. optional inbound email provider

---

## 3.2 Why This Split

This approach keeps the Pi cluster focused on:

- app serving
- orchestration
- persistence
- queues
- background jobs

It avoids using the Pi cluster for:

- large local model inference
- GPU-heavy pipelines
- resource-heavy document processing at scale

---

## 4. Repository Assumptions

This guide assumes the repo has the following high-level structure:

```text
apps/
  web/
  api/
  worker/
packages/
  shared/
  flows/
docs/
infra/
scripts/
```
---

## 5. Minimum Prerequisites

### 5.1 Local Development

Install:

Node.js 20+
pnpm 9+
PostgreSQL 15+
Redis 7+
Git

Optional but recommended:

Docker / Docker Compose
curl / httpie
jq
Make

### 5.2 Raspberry Pi Cluster

Recommended baseline:

Raspberry Pi 5 cluster with SSD-backed storage preferred
Ubuntu Server or Raspberry Pi OS 64-bit
k3s installed if using Kubernetes deployment
working internal networking
ingress/reverse proxy available
enough free RAM for Postgres, Redis, API, web, and worker services

### 5.3 External Accounts / Services

Recommended for POC:

LLM API account
optional OCR / document extraction provider
optional email provider for forwarded-email ingestion

---

## 6. Environment Variables

Create a .env file at the repo root for local development.

### 6.1 Example .env

```text
NODE_ENV=development

# Web
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api

# API
API_PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lcb_poc
REDIS_URL=redis://localhost:6379

# LLM
LLM_PROVIDER=openai
LLM_API_KEY=your_llm_api_key

# Storage
STORAGE_MODE=local
UPLOAD_DIR=./uploads

# Optional OCR
OCR_PROVIDER=none
OCR_API_KEY=

# Optional email forward ingestion
EMAIL_INGESTION_MODE=manual
FORWARDING_SHARED_SECRET=

# App
APP_TIMEZONE=America/New_York
```
---

## 7. Local Development Setup

### 7.1 Clone and Install

git clone <your-repo-url>
cd life-command-bar-poc
pnpm install

### 7.2 Start PostgreSQL and Redis

Option A — local services

Start PostgreSQL and Redis using your OS service manager.

Option B — Docker Compose

Example:

docker compose up -d postgres redis

If your repo already has docker-compose.yml, use that.

### 7.3 Create Database

Example:

createdb lcb_poc

Or with Docker:

docker exec -it <postgres-container> createdb -U postgres lcb_poc

### 7.4 Run Migrations

If Prisma is being used:

pnpm --filter @lcb/api prisma migrate dev

If migrations are not yet set up, this step can be skipped until schema work begins.

### 7.5 Seed Demo Data

If a seed script exists:

pnpm --filter @lcb/api prisma db seed

Or use a custom script:

./infra/scripts/seed-demo-data.sh

### 7.6 Start Services

In separate terminals:

API
pnpm --filter @lcb/api dev
Web
pnpm --filter @lcb/web dev
Worker
pnpm --filter @lcb/worker dev

### 7.7 Verify Health

API health
curl http://localhost:4000/api/health
Today Feed
curl http://localhost:4000/api/today-feed
Web app

Open:

http://localhost:3000

## 8. Minimum POC Smoke Test

Once the services are up, verify the following manually.

### 8.1 Smoke Test Checklist

Web app loads
Today Feed returns 3–5 items or empty-but-valid state
Manual obligation can be created
Resolution flow can be opened for an obligation
Feedback can be submitted
Reminder can be created
Feed updates after obligation change

## 9. Suggested POC Setup Order

To avoid complexity, set up the POC in this order:

repo and workspace
Postgres
Redis
API
web app
worker
basic feed endpoint
obligation persistence
resolution flows
feedback loop
uploads
optional email ingestion
observability

## 10. Deployment Modes

### 10.1 Mode A — Local Laptop Development

Use this for:

day-to-day coding
API and UI iteration
debugging
rapid development

Run all services locally with Postgres and Redis either natively or via Docker.

### 10.2 Mode B — Pi Cluster Internal Demo

Use this for:

internal team demo
end-to-end environment
validating cluster deployment
multi-device access on local network

Deploy:

web app
API
worker
Postgres
Redis
observability

Use hosted LLM inference.

### 10.3 Mode C — Pi Cluster + External Services

Recommended POC mode.

Use the cluster for:

control plane
application services
persistence
queues

Use hosted services for:

LLMs
OCR
optional email routing

This is the best balance for early validation.

## 11. Raspberry Pi Cluster Deployment Guidance

### 11.1 Recommended Service Placement

Node 1
ingress / reverse proxy
web app
Node 2
API service
Node 3
PostgreSQL
Redis
Node 4
worker service
scheduled jobs

This is a recommendation, not a requirement.

For a very early demo, multiple services can run on one node if needed.

### 11.2 Storage Guidance

Prefer SSD-backed storage over SD cards for:

PostgreSQL
uploaded files
logs

This reduces corruption risk and improves responsiveness.

### 11.3 Networking Guidance

Ensure:

fixed internal IPs or stable service DNS
ingress routing for web and API
cluster nodes can reach external LLM endpoints
firewall rules allow internal service communication
11.4 k3s / Kubernetes Notes

If using k3s:

deploy each app as a separate Deployment
deploy Postgres and Redis as StatefulSets or stable singletons for POC
use ConfigMaps and Secrets for environment variables
expose web via ingress
keep API internal or expose behind ingress as needed

For the POC, simplicity matters more than perfect cloud-native design.

## 12. Suggested Docker Compose Services

A typical local Compose file for the POC should include:

postgres
redis
api
web
worker

Optional:

grafana
loki
prometheus

## 13. Observability Setup

### 13.1 Minimum Observability for POC

Capture:

API request logs
worker job logs
feed generation logs
command parse/execute logs
detection job outcomes
feedback event counts

### 13.2 Recommended Metrics

time-to-value
feed generation latency
daily feed action rate
obligation creation rate
feedback event rate
reminder creation rate
upload processing success rate

### 13.3 Suggested Dashboard Groups

system health
feed quality
onboarding funnel
resolution flow performance

## 14. Seed Data Recommendations

For a useful POC demo, seed a few realistic obligations:

Netflix subscription renewing tomorrow
credit card bill due in 2 days
car insurance renewal in 5 days
internet bill due in a week
user-added commitment lingering for 3 days

This allows demonstration of:

subscription flow
bill flow
renewal flow
commitment flow
ranking diversity

## 15. Initial Flow Coverage for POC

The POC should include at least these flow templates:

<b>Subscription</b>
    1. Renewal
    streaming subscription
    2. SaaS subscription
<b>Bill</b>
    1. credit card bill
    2. utility bill
    3. internet bill
<b>Renewal</b>
    1. car insurance renewal
<b>Commitment</b>
1. low-effort manual commitment

The first flows should be high-quality, not broad.

## 16. Testing Guidance

### 16.1 What to Test First

1. create obligation
2. fetch feed
3. fetch resolution flow
4. submit feedback
5. create reminder

### 16.2 POC Testing Philosophy

Prioritize:

1. end-to-end user usefulness
2. correctness of feed behavior
3. clarity of flow output
4. speed to first value

Do not overinvest in edge-case automation before the core loop feels valuable.

## 17. Suggested Scripts

These repo scripts are recommended:

Root scripts
```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm format
```
Helper scripts
```bash
./scripts/dev.sh
./infra/scripts/bootstrap-dev.sh
./infra/scripts/bootstrap-pi.sh
./infra/scripts/seed-demo-data.sh
```
---

## 18. Common Setup Problems

### 18.1 Web cannot reach API

Check:

1. NEXT_PUBLIC_API_BASE_URL
2. API is running
3. CORS settings
4. ingress or proxy routing

### 18.2 Feed is empty

Check:

1. obligations were seeded
2. ranking filters are not too aggressive
3. database connection is correct
4. worker completed initial jobs if async ingestion is used

### 18.3 Uploads fail

Check:

1. upload directory exists
2. file permissions
3. storage mode configuration
4. worker is running for processing

### 18.4 Redis / worker issues

Check:

1. REDIS_URL
2. worker is actually started
3. queue names match
4. jobs are not failing silently

### 18.5 Slow response on Pi cluster

Check:

1. too many services on one node
2. SD-card storage bottleneck
3. oversized Next.js build/runtime load
4. excessive worker concurrency
5. network latency to external LLM APIs

## 19. Recommended POC Success Checklist

The POC is set up correctly when:

1. a new user can create or import a few obligations
2. a useful Today Feed appears quickly
3. at least one flow feels genuinely helpful
4. feedback changes future feed behavior
5. the system can be demoed reliably on local network or laptop

## 20. POC Exit Criteria

The setup is sufficient for product validation if all of the following are true:

1. Today Feed works end-to-end
2. top flow templates are live
3. core APIs are stable
4. feedback and reminders are persisted
5. the system can be run repeatedly without fragile manual steps

## 21. Recommended Next Step After Setup

Once the POC environment is stable, the next priority is not more infrastructure.

The next priority is:

1. obligation model
2. Today Feed ranking
3. top 5 resolution flows
4. feedback loop
5. relief metrics

These determine whether the product actually feels useful.