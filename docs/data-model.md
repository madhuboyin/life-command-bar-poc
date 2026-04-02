# Admin-First Life Command Bar (LCB-A) — Data Model

## 1. Purpose

This document defines the **core data model** for the LCB-A POC and early v1.

It translates:

- system architecture
- API contracts
- resolution flows
- today feed ranking

into **persisted domain entities**.

The goals are:

1. keep the model simple but extensible
2. support the full product loop (detect → prioritize → resolve → learn)
3. avoid premature complexity (no over-modeling, no unnecessary abstraction)
4. be directly translatable to Prisma schema

---

## 2. Design Principles

### 2.1 Obligation-Centric Model

Everything revolves around:

> **Obligation = the unit of life admin**

All other entities support:
- ranking
- resolution
- feedback
- tracking

---

### 2.2 Event + State Hybrid

We store:

- **current state** (Obligation, Reminder)
- **events** (FeedbackEvent, AuditEvent)

This allows:
- simple queries
- future learning
- explainability

---

### 2.3 Minimal Required Entities

v1 intentionally avoids:

- deep normalization
- overly generic schemas
- heavy polymorphism

---

### 2.4 Derived Data Strategy

Some data is:

- computed (Today Feed)
- not persisted initially

Example:
- feed ranking
- recommendation output

---

## 3. Entity Overview

## 3.1 Core Entities

1. User
2. Obligation
3. Reminder
4. FeedbackEvent
5. AuditEvent

---

## 3.2 Supporting Entities

6. ResolutionFlowTemplate (code-defined in v1)
7. ResolutionRun (optional, persisted later if needed)
8. Upload (for documents)
9. ImportSource (email/manual/etc.)

---

## 4. Entity Definitions

---

## 4.1 User

### Purpose

Represents a user and their preferences.

### Fields

```ts
User {
  id: string
  email: string
  name?: string

  timezone: string
  locale?: string

  createdAt: datetime
  updatedAt: datetime
}
```
<b>Notes</b>
- Keep minimal for v1
- Extend later for preferences

---

## 4.2 Obligation (CORE ENTITY)
Purpose

Represents a real-world obligation the user must handle.

Fields
```ts
Obligation {
  id: string

  userId: string

  type: "bill" | "subscription" | "renewal" | "commitment"

  title: string
  description?: string
  vendor?: string

  amount?: number
  currency?: string

  dueDate?: datetime
  recurrence?: string

  source: "manual" | "email" | "document" | "inferred"

  confidenceScore: float
  urgencyScore: float
  importanceScore: float

  effortLevel: "low" | "medium" | "high"
  impactLevel: "low" | "medium" | "high"

  status: "active" | "resolved" | "postponed" | "ignored" | "draft"

  lastShownAt?: datetime
  lastActedAt?: datetime

  createdAt: datetime
  updatedAt: datetime
}
```
<b>Key Design Notes</b>

<b> Why no separate "Subscription" table?</b>
- keep model simple
- behavior handled by flow engine
- avoid premature specialization

<b>Why store scores?</b>
- avoids recomputing everything
- supports ranking tuning
- enables explainability

<b>Why lastShownAt?</b>
- prevents feed repetition
- supports suppression logic

---

### 4.3 Reminder
<b>Purpose</b>

Represents scheduled reminders for obligations.

<b>Fields</b>
```ts
Reminder {
  id: string

  userId: string
  obligationId?: string

  title: string
  scheduledFor: datetime

  status: "scheduled" | "triggered" | "cancelled"

  createdAt: datetime
  updatedAt: datetime
}
```
<b>Key Design Notes</b>
- reminders can exist without obligation (future support)
- v1 mainly ties to obligations

### 4.4 FeedbackEvent
<b>Purpose</b>

Captures user reactions to feed items and recommendations.

<b>Fields</b>
```ts
FeedbackEvent {
  id: string

  userId: string
  obligationId?: string
  feedItemId?: string

  type:
    | "accepted"
    | "ignored"
    | "modified"
    | "completed"
    | "postponed"
    | "rejected"
    | "not_relevant"
    | "wrong_info"
    | "dont_show_again"

  note?: string

  createdAt: datetime
}
```
<b>Key Design Notes</b>
- This is critical for learning.
- Do not skip or simplify this.

---

### 4.5 AuditEvent
<b>Purpose</b>

Stores system + user actions for traceability.

<b>Fields</b>
```ts
AuditEvent {
  id: string

  userId: string
  obligationId?: string

  eventType: string
  metadata?: json

  createdAt: datetime
}
```
<b>Example Events</b>
- obligation_created
- obligation_updated
- feed_generated
- recommendation_shown
- recommendation_accepted
- reminder_created

---

### 4.6 Upload
<b>Purpose</b>

Tracks uploaded documents.

<b>Fields</b>
```ts
Upload {
  id: string

  userId: string

  fileName: string
  fileType: string
  fileSize: number

  storagePath: string

  status: "uploaded" | "processing" | "processed" | "failed"

  createdAt: datetime
}
```

---

### 4.7 ImportSource
<b>Purpose</b>

Tracks origin of obligation creation.

<b>Fields</b>
```ts
ImportSource {
  id: string

  userId: string

  type: "email" | "manual" | "document"

  rawData?: json

  createdAt: datetime
}
```
---

### 4.8 ResolutionRun (Optional v1 / Required v2)

<b>Purpose</b>

Stores actual flow execution results (for analytics + learning).

<b>Fields</b>

```ts
ResolutionRun {
  id: string

  userId: string
  obligationId: string

  flowKey: string

  recommendedOption: string

  confidence: "high" | "medium" | "low"

  createdAt: datetime
}
```
<b>Key Design Notes</b>
- optional for POC
- becomes important later for learning

## 5. Relationships

### 5.1 Diagram (Logical)

```
User
 ├── Obligation
 │     ├── Reminder
 │     ├── FeedbackEvent
 │     ├── AuditEvent
 │     └── ResolutionRun
 │
 ├── Upload
 └── ImportSource
 
```

---

## 6. Indexing Strategy

### 6.1 Required Indexes
```ts
Obligation
(userId, status)
(userId, dueDate)
(userId, type)
(userId, lastShownAt)
Reminder
(userId, scheduledFor)
(status)
FeedbackEvent
(userId, createdAt)
(obligationId)
AuditEvent
(userId, createdAt)
(obligationId)
```

---

## 7. Derived / Computed Data

### 7.1 Not Persisted in v1

These should NOT be stored initially:

Today Feed items
ranking scores (composite)
resolution output
recommendation text

<b>Why</b>
- keeps system flexible
- avoids stale data
- simplifies iteration

---

## 8. Data Lifecycle

### 8.1 Obligation Lifecycle
draft → active → postponed → resolved / ignored

### 8.2 Feedback Lifecycle

Each user interaction generates:

Feed Item → FeedbackEvent → Ranking Adjustment

### 8.3 Reminder Lifecycle

scheduled → triggered → completed/cancelled

---

## 9. Multi-Tenancy Model

### 9.1 Strategy
simple row-level isolation using userId

### 9.2 Rule

Every table must include:
```
userId
```

---

## 10. Data Integrity Rules

### 10.1 Required Rules
1. Each Obligation must belong to a user
2. Each Reminder must belong to a user
3. Each Feedback must reference user
4. No orphaned obligations
5. Status transitions must be valid

### 10.2 Example Valid Transitions
active → resolved
active → postponed
postponed → active
active → ignored

---

## 11. Soft Delete Strategy

<b>v1 Decision</b>

No soft deletes.

Use:

- status = ignored
- status = resolved

<b>Why</b>
- simpler queries
- aligns with product semantics

---
## 12. Data Growth Expectations
<b>v1 Scale</b>
- small user base
- low document volume
- moderate feedback events

<b>Bottlenecks (Future)</b>
- FeedbackEvent growth
- AuditEvent growth

<b>Mitigation Later</b>
- archival tables
- partitioning
- event compression

---

## 13. Open Data Questions

1. Should recurrence be structured or string-based?
2. Should vendor be normalized later?
3. When to introduce embeddings?
4. When to persist resolution outputs?
5. Should obligations be versioned?

### Recommended v1 Answers
1. string-based recurrence
2. vendor = string
3. no embeddings
4. no resolution persistence
5. no versioning

---
## 14. Mapping to Prisma (Next Step)

This document is directly translatable to Prisma models.

<b>Next Steps</b>

- create schema.prisma
- define enums
- define models
- add indexes
- add relations

---

## 15. Summary

The LCB-A data model is:

- obligation-centric
- event-aware
- simple but extensible

It enables:

1. Today Feed ranking
2. resolution flows
3. feedback learning
4. reminders
5. auditability

<b>Without:</b>

- unnecessary complexity
- premature optimization
- heavy AI infrastructure dependencies




