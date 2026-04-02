# Admin-First Life Command Bar (LCB-A) — Architecture Decisions

## 1. Purpose

This document records key architecture decisions for the LCB-A POC and early v1.

These decisions are:

- intentional
- scoped for fast execution
- revisitable as the system evolves

The goal is to avoid re-debating foundational choices and to maintain clarity during implementation.

---

## 2. Decision Format

Each decision includes:

- context
- decision
- rationale
- trade-offs
- revisit criteria

---

## 3. ADR-001 — Monorepo Architecture

<b>Context</b>

The system consists of:

- web app
- API
- worker
- shared types
- resolution flows

<b>Decision</b>

- Use a **single monorepo** with:

```text
apps/
packages/
docs/
infra/
```
---

<b>Rationale</b>

- faster development velocity
- easier shared types and contracts
- simpler refactoring across layers
- aligned with POC speed requirements

<b>Trade-offs</b>

- larger repo size
- potential coupling if not disciplined

<b>Revisit When</b>

- multiple independent teams exist
- services need independent deployment cycles

## 4. ADR-002 — Next.js for Web App
<b>Context</b>

The UI must:

- render Today Feed
- support command bar
- feel fast and modern
- support server-side rendering where useful

<b>Decision</b>

- Use Next.js (App Router) for the web app.

<b>Rationale</b>

- fast iteration
- server + client hybrid model
- strong ecosystem
- easy API integration
- future SSR support for performance

<b>Trade-offs</b>

- build overhead
- complexity compared to simple SPA

<b>Revisit When</b>

- performance constraints on Pi become significant
- mobile-first native app becomes priority

## 5. ADR-003 — Node.js + Express API
<b>Context</b>

Backend needs:

- REST APIs
- command orchestration
- integration with flows and data layer

<b>Decision</b>

- Use Node.js + Express.

<b>Rationale</b>

- simplicity
- fast setup
- aligns with monorepo TypeScript stack
- low overhead for POC

<b>Trade-offs</b>

- less structured than heavier frameworks
- requires discipline for scaling

<b>Revisit When</b>

- domain complexity increases significantly
- need for stricter modular architecture

## 6. ADR-004 — PostgreSQL as Primary Data Store
<b>Context</b>

Core data includes:

- obligations
- feedback
- reminders
- audit events

<b>Decision</b>

- Use PostgreSQL as the system of record.

<b>Rationale</b>

- structured data fits relational model
- strong querying for ranking logic
- transactional safety
- simple to reason about

<b>Trade-offs</b>

- less flexible for unstructured data
- not optimized for semantic search

<b>Revisit When</b>

- large-scale semantic retrieval becomes critical
- hybrid vector + relational queries are needed

## 7. ADR-005 — Redis for Queue and Cache
<b>Context</b>

System requires:

- async processing
- job queues
- light caching

<b>Decision</b>

- Use Redis.

<b>Rationale</b>

- simple queue integration
- widely supported
- sufficient for POC scale

<b>Trade-offs</b>

- not durable like a full message broker
- limited advanced queue semantics

<b>Revisit When</b>

- need for guaranteed delivery
- high-scale job processing
- multi-region deployment

## 8. ADR-006 — Worker-Based Async Processing
<b>Context</b>

Some tasks should not block API requests:

- document parsing
- detection
- feed refresh
- reminders

<b>Decision</b>

- Introduce a dedicated worker service.

<b>Rationale</b>

- decouples heavy processing
- improves API responsiveness
- aligns with scalable architecture

<b>Trade-offs</b>

- added complexity
- need for queue management

<b>Revisit When</b>

- job volume increases significantly
- need for distributed job orchestration

## 9. ADR-007 — External LLM Usage (No Local Inference)
<b>Context</b>

System requires:

- natural language parsing
- extraction
- reasoning for flows

<b>Decision</b>

Use hosted LLM APIs.

<b>Rationale</b>

- avoids heavy compute on Pi cluster
- faster to implement
- higher quality outputs
- reduces infra complexity

<b>Trade-offs</b>

- API cost
- network latency
- dependency on external provider

<b>Revisit When</b>

- cost becomes significant
- need for offline or private inference
- edge inference becomes viable

## 10. ADR-008 — Hybrid Detection Strategy
<b>Context</b>

- Obligation detection must balance:

- accuracy
- cost
- speed

<b>Decision</b>

<b>Use hybrid detection:</b>

- rule-based extraction for simple cases
- LLM extraction for unstructured input
- user confirmation for low confidence

<b>Rationale</b>

- reduces unnecessary LLM calls
- improves reliability
- keeps system interpretable

<b>Trade-offs</b>

- more implementation complexity
- need to maintain rules + LLM logic

<b>Revisit When</b>

- detection accuracy stabilizes
- model-based extraction becomes cheaper and faster

## 11. ADR-009 — Code-Defined Resolution Flows
<b>Context</b>

- Resolution flows are the core product logic.

<b>Decision</b>

- Define flows in code (packages/flows) for v1.

<b>Rationale</b>

- faster iteration
- version-controlled
- easier to debug and test
- avoids premature CMS/config complexity

<b>Trade-offs</b>

- less flexible for non-engineers
- requires deployment for changes

<b>Revisit When</b>

- need for dynamic flow updates
- product team needs control over flows
- A/B testing of flows becomes important

## 12. ADR-010 — On-Demand Today Feed Computation
<b>Context</b>

- Today Feed must reflect:

- latest obligations
- recent feedback
- recent changes

<b>Decision</b>

- Compute feed on read with light caching.

<b>Rationale</b>

- simpler implementation
- always fresh results
- avoids complex invalidation logic

<b>Trade-offs</b>

- repeated computation
- potential latency if logic grows

<b>Revisit When</b>

- feed generation becomes slow
- user base grows significantly
- need for precomputation

## 13. ADR-011 — Feedback as First-Class Data
<b>Context</b>

- Product quality depends on:

- user corrections
- user preferences
- suppression signals

<b>Decision</b>

- Store feedback events explicitly and treat them as core domain data.

<b>Rationale</b>

- enables learning loop
- improves feed quality over time
- supports personalization

<b>Trade-offs</b>

- additional data model complexity
- need to interpret feedback signals correctly

<b>Revisit When</b>

- moving to ML-driven personalization
- need for real-time adaptation

## 14. ADR-012 — Strict Feed Size Limit (3–5 Items)
<b>Context</b>

- Too many items reduce clarity and increase cognitive load.

<b>Decision</b>

- Limit Today Feed to 3–5 items.

<b>Rationale</b>

- enforces focus
- improves usability
- aligns with product philosophy

<b>Trade-offs</b>

- some items are hidden
- requires strong ranking

<b>Revisit When</b>

- introducing alternative views (expanded list, history)
- advanced user modes

## 15. ADR-013 — No Autonomous Execution in v1
<b>Context</b>

- The system could theoretically:

- pay bills
- cancel subscriptions
- execute actions

<b>Decision</b>

- Do not perform autonomous actions in v1.

<b>Rationale</b>

- reduces risk
- avoids trust issues
- simplifies legal and security concerns
- focuses on decision support first

<b>Trade-offs</b>

- user must complete actions externally
- slightly more friction

<b>Revisit When</b>

- strong trust established
- clear safe automation opportunities identified

## 16. ADR-014 — Raspberry Pi Cluster as Control Plane
<b>Context</b>

- Infrastructure includes a Pi cluster.

<b>Decision</b>

Use Pi cluster for:

- control plane
- app services
- API
- workers
- database
- cache

Do not use it for:

heavy AI inference

<b>Rationale</b>

- cost-effective
- sufficient for POC
- leverages existing setup

<b>Trade-offs</b>

- limited compute
- potential performance constraints

<b>Revisit When</b>

- scaling beyond POC
- need for high availability
- heavy workloads introduced

## 17. ADR-015 — REST API (Not GraphQL for v1)
<b>Context</b>

- API needs are:

- simple
- predictable
- easy to debug

<b>Decision</b>

- Use REST APIs.

<b>Rationale</b>

- simpler to implement
- easier debugging
- aligns with current team experience
- sufficient for POC

<b>Trade-offs</b>

- less flexible querying
- potential over-fetching

<b>Revisit When</b>

- complex client data needs emerge
- multiple clients require flexible queries

## 18. ADR-016 — No Vector DB for v1
<b>Context</b>

- Vector databases are useful for:

- semantic search
- embeddings

<b>Decision</b>

- Do not introduce a vector DB in v1.

<b>Rationale</b>

- not required for core POC
- adds unnecessary complexity
- relational model is sufficient

<b>Trade-offs</b>

- limited semantic retrieval
- fewer AI-driven features

<b>Revisit When</b>

- need for semantic search
- large-scale document ingestion
- advanced personalization

## 19. ADR-017 — Simple Personalization (Rules-Based)
<b>Context</b>

- Personalization is valuable but complex.

<b>Decision</b>

Use rules-based personalization in v1.

<b>Rationale</b>

- interpretable
- easy to debug
- aligns with POC scope

<b>Trade-offs</b>

- less sophisticated
- limited adaptability

<b>Revisit When</b>

- enough data collected
- ML-based personalization becomes viable

## 20. ADR-018 — Compute Simplicity Over Premature Optimization
<b>Context</b>

-  System could be optimized early.

<b>Decision</b>

- Prefer simple, understandable implementations over optimized ones.

<b> Rationale</b>

- faster iteration
- easier debugging
- better product learning

<b>Trade-offs</b>

- some inefficiency
- potential rework later

<b>Revisit When</b>

- performance bottlenecks appear
- scaling requirements increase

## 21. Summary

The architecture decisions for LCB-A prioritize:

1. Monorepo
2. speed of execution
3. clarity of system behavior
4. product-first thinking
5. low infrastructure complexity
6. strong foundations for iteration

The system is intentionally:

- simple but structured
- opinionated but flexible
- focused on usefulness over completeness

These decisions should remain stable during POC unless a clear blocker emerges.