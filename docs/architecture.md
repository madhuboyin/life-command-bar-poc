# Admin-First Life Command Bar (LCB-A) — System Architecture

## 1. Purpose

This document defines the system architecture for the Admin-First Life Command Bar (LCB-A) POC and v1.

It translates the product requirements into a buildable architecture for command intake, obligation detection, prioritization, Today Feed generation, resolution flow generation, feedback and learning, trust, and observability.

This architecture is optimized for fast POC delivery, clear service boundaries, strong product iteration, Raspberry Pi cluster-friendly application deployment, and external LLM/API usage for intelligence-heavy tasks.

---

## 2. Scope and Goals

### 2.1 Primary Goals

The system must:

1. Deliver a useful Today Feed within 2 minutes of onboarding.
2. Support 3–5 high-quality daily items.
3. Make every surfaced item answer:
   - Why does this matter?
   - What should I do?
   - How hard is it?
4. Keep the user in control.
5. Build a foundation for future learning and low-risk automation.

### 2.2 Non-Goals for v1

The system will not:

1. Auto-pay bills or execute financial transactions.
2. Integrate directly with bank accounts.
3. Operate as a broad inbox assistant.
4. Support universal web automation.
5. Attempt zero-input, universal obligation detection.

---

## 3. Architectural Principles

### 3.1 Product Principles

LCB-A is not a task manager, not a reminder app, and not a passive tracker.

It is an obligation → decision → action → resolution system.

### 3.2 Technical Principles

The architecture should:

1. Stay modular but simple for v1.
2. Use deterministic logic where possible.
3. Use LLMs selectively rather than pervasively.
4. Persist structured obligation objects early.
5. Keep detection, prioritization, and resolution as separate responsibilities.
6. Treat resolution flows as first-class product logic.
7. Capture feedback signals from day one.

### 3.3 UX Principle

> The system should always do more thinking than the user.

---

## 4. High-Level Architecture

```text
User Surface
  ├─ Web App (Today Feed, Command Bar, Obligation Detail, Feedback UI)
  └─ Optional Upload / Forwarded Email Entry

Application Layer
  ├─ API Service
  ├─ Command Orchestrator
  ├─ Obligation Service
  ├─ Today Feed Service
  ├─ Resolution Flow Service
  ├─ Feedback Service
  └─ Reminder Service

Async / Background Layer
  ├─ Detection Worker
  ├─ Feed Refresh Worker
  ├─ Reminder Worker
  └─ Learning Update Worker

Data Layer
  ├─ PostgreSQL
  ├─ Redis
  ├─ Object Storage (local/S3-compatible)
  └─ Audit / Event Log

External Services
  ├─ LLM API
  ├─ Optional OCR / Document Parsing API
  └─ Email Provider / Inbound Forwarding Hook

Observability
  ├─ Metrics
  ├─ Logs
  ├─ Dashboards
```
---

## 5. Detailed Architecture

### 5.1 Web App

The web app is the primary user interface.

1. Responsibilities
2. Render Today Feed.
3. Capture natural-language commands.
4. Show obligation details.
5. Show resolution guidance.
6. Collect user feedback.
7. Support manual entry and document upload.
8. Primary Screens
9. Secondary Screens
10. Home / Today Feed
11. Obligation Detail
12. Command Result
13. Add Obligation
14. Upload / Import
15. Settings / Data Controls

### 5.2 API Service

The API service is the main application backend.

1. Responsibilities
    1.1 Expose REST endpoints.
    1.2 Validate requests.
    1.3 Orchestrate command processing.
    1.4 Read and write domain objects.
    1.5 Trigger asynchronous jobs.
    1.6 Return UI-ready responses.

2. Core Modules
    2.1 Command controller/service
    2.2 Obligation controller/service
    2.3 Today Feed controller/service
    2.4 Feedback controller/service
    2.5 Upload controller/service
    2.6 Reminder controller/service

### 5.3 Command Orchestrator

The command orchestrator converts natural-language input into domain actions.

Responsibilities
Classify command intent.
Extract entities.
Resolve the target obligation, if one exists.
Map command input to one of:
existing obligation lookup
new obligation creation
resolution flow trigger
clarification request

Example

Input:

Prepare to cancel Netflix

Output:

Identify target obligation: Netflix subscription
Trigger subscription resolution flow
Return recommendation, steps, and primary action

### 5.4 Obligation Detection Engine

The obligation detection engine converts raw input into structured obligation objects.

Input Sources in v1
Manual entry
Assisted input
Uploaded documents
Forwarded emails
Inferred suggestions later
Responsibilities
Detect obligation type.
Extract due date, amount, vendor, and title.
Assign source and confidence.
Generate normalized obligation objects.
Require confirmation or edit when confidence is low.

This is a hybrid system:

Rule and pattern extraction for obvious cases
LLM extraction for unstructured input
User confirmation for uncertain output
5.5 Context and Memory Layer

The context and memory layer stores durable state about obligations and user interactions.

Responsibilities
Store obligations.
Store user preferences.
Store action history.
Store feedback events.
Store reminders.
Provide context to prioritization and flow generation.

Use relational storage first. Do not overbuild a vector-memory system for the POC.

### 5.6 Prioritization Engine

The prioritization engine ranks obligations for the Today Feed.

Inputs
Due date proximity
Urgency
Financial or penalty impact
Confidence
Effort estimate
User history
Unresolved age
Quick-win potential
Output

A ranked set of candidate obligations, from which only 3–5 are shown.

Feed Rule

The Today Feed must include at least one:

urgent item
money-related item
or high-confidence quick win

This prevents the feed from feeling empty or low value.

### 5.7 Resolution Flow Engine

The Resolution Flow Engine is the core product engine and primary differentiator.

Responsibilities

For each obligation:

Identify the applicable flow template.
Generate decision options.
Recommend a default path.
Generate clear step-by-step guidance.
Surface one primary action.
Limit secondary actions to 2–3.
v1 Flow Families
Subscription
Bill
Renewal
Commitment
Resolution Quality Bar

Each flow must:

Reduce user thinking.
Remove at least one manual step.
Provide non-obvious context where possible.
Feel faster than doing it manually.
Deliver a clear primary action within seconds.

### 5.8 Today Feed Engine

The Today Feed Engine builds the daily feed.

Responsibilities
Pull active obligations.
Apply ranking.
Apply the 3–5 item cap.
Enrich top items with flow output.
Generate cards that answer:
why
what
how hard
Feed Item Contract

Each feed item should include:

Obligation summary
Why it matters
Recommended action
Effort
Impact
Confidence
Primary action
Secondary actions
State metadata

### 5.9 Feedback and Learning Layer

The Feedback and Learning Layer closes the loop and enables compounding system quality.

Responsibilities

Capture:

accepted recommendation
ignored
modified
completed
postponed
rejected
not relevant
wrong info
don’t show again

Use outcomes to:

Improve confidence
Personalize future suggestions
Tune prioritization
Tune flow recommendations
v1 Design

This is rules plus stored signals, not a self-learning autonomous system.

### 5.10 Failure and Recovery Model

The failure and recovery model handles wrong or weak system output gracefully.

Per-Item Recovery Actions
Not relevant
Wrong info
Edit
Don’t show again
Mark done
Postpone
Purpose
Preserve trust
Improve future feed quality
Supply feedback signals for learning

### 5.11 Reminder Service

The reminder service supports internal reminders only.

Responsibilities
Create reminders from obligations
Create reminders from user commands
Schedule reminder jobs
Feed reminder state back into obligation history
v1 Boundary

No external transactional action. Internal reminders only.

## 6. Data Architecture

### 6.1 Primary System of Record

PostgreSQL

Why PostgreSQL
Obligations are structured.
Relationships matter.
Auditability matters.
Ranking queries matter.
It is simpler and more reliable than overusing vector storage for the POC.

### 6.2 Cache and Queue

Redis

Uses
Asynchronous job queue
Background processing
Short-lived cache
Reminder scheduling support

### 6.3 Object Storage

Use local storage for the POC or S3-compatible storage if desired.

Uses
Uploaded PDFs and images
Source artifacts
Future exports if needed

### 6.4 Audit and Event Log

Store domain events in PostgreSQL initially.

Event Examples
obligation_created
obligation_confirmed
feed_generated
recommendation_accepted
item_postponed
item_rejected

## 7. Core Domain Model

### 7.1 Main Entities

User

Stores basic account, preferences, and profile settings.

Obligation

Core domain object.

Typical fields:

id
type
title
vendor
due_date
amount
recurrence
source
confidence_score
urgency_score
importance_score
effort_level
impact_level
status
FeedItem

Materialized or generated representation for Today Feed.

ResolutionFlowTemplate

Structured template for obligation family and subtype.

ResolutionRecommendation

Generated recommendation for a specific obligation instance.

FeedbackEvent

Represents user response to system guidance.

Reminder

Represents a scheduled internal reminder.

AuditEvent

Represents system or user domain events.

## 8. Core Processing Flows

### 8.1 Flow A — Manual Add Obligation
User enters: Track my car insurance renewal
API sends text to Command Orchestrator
Intent classified as new obligation creation
Detection Engine extracts:
type = renewal
title = car insurance
Obligation created with confidence
Feed refresh job triggered
Today Feed updated

### 8.2 Flow B — Upload Bill or Document
User uploads document
File stored
Async detection job triggered
Detection engine extracts structured fields
Obligation created as draft or confirmed candidate
User confirms or edits if needed
Obligation enters active set
Feed refresh runs

### 8.3 Flow C — Query Today Feed
User opens app or asks command
API requests current feed
Today Feed Engine ranks active obligations
Resolution Flow Engine enriches top items
API returns 3–5 cards

### 8.4 Flow D — Resolution Guidance
User asks: Help me handle this
Command refers to an existing obligation
Resolution Flow Engine selects template
Recommendation and steps returned
User can act, postpone, or reject

### 8.5 Flow E — Feedback Loop
User clicks Not relevant
Feedback event stored
Obligation or feed state updated
Learning job updates confidence or suppression rules
Future feed quality improves

## 9. API Surface (High Level)

### 9.1 Command APIs
POST /commands/parse
POST /commands/execute

### 9.2 Obligation APIs
GET /obligations
POST /obligations
PATCH /obligations/:id
POST /obligations/:id/confirm
POST /obligations/:id/postpone
POST /obligations/:id/dismiss

### 9.3 Today Feed APIs
GET /today-feed
POST /today-feed/refresh

### 9.4 Feedback APIs
POST /feedback
POST /obligations/:id/dismiss
POST /obligations/:id/mark-done

### 9.5 Upload APIs
POST /uploads
POST /imports/email-forward

### 9.6 Reminder APIs
POST /reminders
GET /reminders

## 10. Deployment Architecture for POC

For the POC, the Raspberry Pi cluster should be used as the application and control plane, while model inference remains external.

### 10.1 On the Pi Cluster
Web app
API service
Worker service
PostgreSQL
Redis
Observability stack

### 10.2 External or Hosted Services
LLM API
Optional OCR or document parsing API
Optional email provider

This keeps the POC realistic, low-cost, and aligned with earlier infrastructure decisions.

## 11. Security and Privacy Architecture

### 11.1 v1 Requirements
Encrypted transport
Hashed auth and session secrets
Least-privilege data access
User-visible data ownership and deletion controls
No bank access
No autonomous payments

### 11.2 Trust Requirements

Each surfaced item should clearly indicate:

source of detection
confidence
why it appeared
what action is recommended

## 12. Observability Architecture

### 12.1 Metrics

Track:

Command parse success rate
Detection accuracy
Feed generation latency
Feed action rate
not relevant rate
Recommendation acceptance rate
Time-to-value
Daily interactions per user

### 12.2 Logs
Command processing logs
Detection logs
Worker job logs
API request logs

### 12.3 Dashboards
Onboarding and value dashboard
Feed quality dashboard
Resolution flow performance dashboard
System health dashboard

## 13. Scalability and Evolution

### 13.1 v1 Scale Assumptions
Low concurrency
Small document volume
Limited users
Hosted LLM usage

### 13.2 Future-Ready Decisions
Resolution Flow Engine isolated as its own module/package
Worker-based async processing
Clear command orchestration layer
Feedback events stored from day one

This supports future expansion into more flow types, low-risk automation, vendor integrations, and predictive obligation detection.

## 14. Open Architecture Questions

These questions do not block the POC, but should be tracked explicitly.

### 14.1 Command Processing

Should commands be routed through a hybrid classifier plus fallback, or fully through an LLM first?

### 14.2 Feed Generation

Should the Today Feed be computed on read, or precomputed on schedule and invalidated on updates?

### 14.3 Flow Templates

Should templates be code-defined first, or stored and managed in the database?

### 14.4 Email Ingestion

Should email entry begin with forwarding-mailbox support, or wait for OAuth inbox integration later?

### 14.5 Learning Layer

Should v1 remain rule-based, or include light model-assisted personalization?

Recommended v1 Answers
Hybrid command routing
Compute on read with light caching
Code-defined templates first
Forwarding mailbox first
Rule-based learning first

##15. Recommended v1 Technology Decisions

To keep the build tight and practical:

Monorepo
Next.js web app
Express API
PostgreSQL
Redis
Worker service
Code-defined resolution flow templates
External LLM API
Manual + upload-first ingestion
On-demand Today Feed generation

## 16. System Summary

The system is best understood as five connected loops:

### 16.1 Input Loop

User command, upload, or manual entry → structured obligation

### 16.2 Prioritization Loop

Obligations → ranked candidates → 3–5 feed items

### 16.3 Resolution Loop

Obligation → flow template → recommendation + action path

### 16.4 Feedback Loop

User response → updated confidence, suppression, and personalization

### 16.5 Relief Loop

Resolved actions → visible time, money, and mental relief → repeat usage

This is the actual product architecture of LCB-A.