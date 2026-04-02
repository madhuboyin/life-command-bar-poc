# Admin-First Life Command Bar (LCB-A) — API Contracts

## 1. Purpose

This document defines the v1 API contracts for the Admin-First Life Command Bar (LCB-A) POC.

The goals of this API layer are to:

1. Support the Today Feed as the primary surface.
2. Support command-driven interaction.
3. Persist structured obligations.
4. Trigger and return resolution guidance.
5. Capture feedback and reminder actions.
6. Keep contracts simple, explicit, and easy to evolve.

This is not a public API specification. It is an internal product and engineering contract for the POC and early v1.

---

## 2. API Conventions

### 2.1 Base URL

Example local base URL:

```text
http://localhost:4000/api
```

### 2.2 Content Type

Requests and responses use JSON unless otherwise specified.

Content-Type: application/json

Uploads use multipart/form-data.

### 2.3 Response Envelope

All successful responses should follow this envelope:

{
  "success": true,
  "data": {}
}

All error responses should follow this envelope:

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Readable error message",
    "details": {}
  }
}

### 2.4 Timestamps

All timestamps use ISO 8601 UTC strings.

Example:

2026-04-02T15:30:00.000Z

### 2.5 IDs

All entity IDs are opaque strings.

Examples:

usr_123
obl_123
feed_123
fbk_123
rem_123

### 3. Domain Enums

#### 3.1 ObligationType
type ObligationType =
  | "bill"
  | "subscription"
  | "renewal"
  | "commitment";

#### 3.2 ObligationSource
type ObligationSource =
  | "manual"
  | "email"
  | "document"
  | "inferred";

####3.3 ObligationStatus
type ObligationStatus =
  | "active"
  | "resolved"
  | "postponed"
  | "ignored"
  | "draft";

#### 3.4 EffortLevel
type EffortLevel = "low" | "medium" | "high";

#### 3.5 ImpactLevel
type ImpactLevel = "low" | "medium" | "high";

#### 3.6 CommandIntent
type CommandIntent =
  | "awareness"
  | "tracking"
  | "action_preparation"
  | "reminder"
  | "resolution_guidance"
  | "clarification";

#### 3.7 FeedbackType
type FeedbackType =
  | "accepted"
  | "ignored"
  | "modified"
  | "completed"
  | "postponed"
  | "rejected"
  | "not_relevant"
  | "wrong_info"
  | "dont_show_again";

### 4. Core Data Contracts

#### 4.1 Obligation
{
  "id": "obl_123",
  "type": "subscription",
  "title": "Netflix Subscription",
  "description": "Monthly streaming plan",
  "vendor": "Netflix",
  "amount": 15.49,
  "currency": "USD",
  "dueDate": "2026-04-05T00:00:00.000Z",
  "recurrence": "monthly",
  "source": "manual",
  "confidenceScore": 0.94,
  "urgencyScore": 82,
  "importanceScore": 61,
  "effortLevel": "low",
  "impactLevel": "medium",
  "status": "active",
  "suggestedActions": [
    "review_subscription",
    "keep_for_now",
    "cancel_later"
  ],
  "createdAt": "2026-04-02T12:00:00.000Z",
  "updatedAt": "2026-04-02T12:00:00.000Z"
}
Field Notes
confidenceScore is a 0–1 float.
urgencyScore and importanceScore are normalized ranking scores.
effortLevel and impactLevel are user-facing simplifications.

#### 4.2 TodayFeedItem
{
  "id": "feed_123",
  "obligationId": "obl_123",
  "obligation": {
    "id": "obl_123",
    "type": "subscription",
    "title": "Netflix Subscription",
    "vendor": "Netflix",
    "dueDate": "2026-04-05T00:00:00.000Z",
    "confidenceScore": 0.94,
    "effortLevel": "low",
    "impactLevel": "medium",
    "status": "active"
  },
  "whyItMatters": "This renews tomorrow and may not be worth keeping if you are not using it.",
  "whatToDo": "Review before renewal and decide whether to keep or cancel.",
  "howHardIsIt": "low",
  "primaryAction": {
    "key": "review_subscription",
    "label": "Review subscription"
  },
  "secondaryActions": [
    {
      "key": "keep_for_now",
      "label": "Keep for now"
    },
    {
      "key": "cancel_later",
      "label": "Cancel later"
    }
  ],
  "rank": 1,
  "hookType": "money",
  "generatedAt": "2026-04-02T12:05:00.000Z"
}

#### 4.3 ResolutionRecommendation
{
  "flowKey": "subscription.default",
  "recommendation": "Review Netflix before tomorrow to avoid the next charge.",
  "whyItMatters": "You may be paying for a recurring service that is easy to ignore.",
  "decisionOptions": [
    {
      "key": "keep",
      "label": "Keep subscription",
      "description": "Useful if you still use it regularly."
    },
    {
      "key": "cancel",
      "label": "Cancel subscription",
      "description": "Avoid the next recurring charge."
    },
    {
      "key": "downgrade",
      "label": "Downgrade plan",
      "description": "Reduce cost while keeping access."
    }
  ],
  "recommendedOption": "cancel",
  "steps": [
    "Open the Netflix account page.",
    "Go to Billing.",
    "Review next billing date before confirming cancellation."
  ],
  "primaryAction": {
    "key": "open_resolution_flow",
    "label": "Review cancellation steps"
  },
  "secondaryActions": [
    {
      "key": "keep_for_now",
      "label": "Keep for now"
    },
    {
      "key": "remind_me_tomorrow",
      "label": "Remind me tomorrow"
    }
  ]
}

#### 4.4 FeedbackEvent
{
  "id": "fbk_123",
  "obligationId": "obl_123",
  "feedItemId": "feed_123",
  "type": "not_relevant",
  "note": "This was already canceled",
  "createdAt": "2026-04-02T12:10:00.000Z"
}

#### 4.5 Reminder
{
  "id": "rem_123",
  "obligationId": "obl_123",
  "title": "Review Netflix Subscription",
  "scheduledFor": "2026-04-03T09:00:00.000Z",
  "status": "scheduled",
  "createdAt": "2026-04-02T12:15:00.000Z"
}

### 5. Command APIs

#### 5.1 POST /api/commands/parse

Parse a natural-language command and return its intent plus structured interpretation.

Request
{
  "input": "Prepare to cancel Netflix",
  "context": {
    "obligationId": "obl_123"
  }
}
Response
{
  "success": true,
  "data": {
    "intent": "action_preparation",
    "confidence": 0.93,
    "entities": {
      "vendor": "Netflix",
      "obligationType": "subscription"
    },
    "resolution": {
      "type": "existing_obligation",
      "obligationId": "obl_123"
    },
    "needsClarification": false
  }
}
Notes
This endpoint does not mutate state.
It is used by the command bar for preview/interpretation.

#### 5.2 POST /api/commands/execute

Execute a command at the application level. In v1, this means lookup, creation, flow routing, or clarification.

Request
{
  "input": "What do I need to handle today?",
  "context": {}
}
Response (Today Feed Query)
{
  "success": true,
  "data": {
    "resultType": "today_feed",
    "items": [
      {
        "id": "feed_123",
        "obligationId": "obl_123",
        "whyItMatters": "This renews tomorrow.",
        "whatToDo": "Review before renewal.",
        "howHardIsIt": "low",
        "primaryAction": {
          "key": "review_subscription",
          "label": "Review subscription"
        },
        "secondaryActions": []
      }
    ]
  }
}
Response (Resolution Flow Trigger)
{
  "success": true,
  "data": {
    "resultType": "resolution_flow",
    "obligationId": "obl_123",
    "recommendation": {
      "flowKey": "subscription.default",
      "recommendation": "Review Netflix before tomorrow to avoid the next charge.",
      "recommendedOption": "cancel",
      "steps": [
        "Open billing settings.",
        "Review renewal date.",
        "Confirm cancellation if desired."
      ]
    }
  }
}
Response (Clarification)
{
  "success": true,
  "data": {
    "resultType": "clarification",
    "question": "Which subscription did you mean?",
    "options": [
      {
        "id": "obl_123",
        "label": "Netflix Subscription"
      },
      {
        "id": "obl_456",
        "label": "Spotify Subscription"
      }
    ]
  }
}

### 6. Obligation APIs

#### 6.1 GET /api/obligations

Return obligations for the current user.

Query Params
status optional
type optional
limit optional
offset optional
Example
GET /api/obligations?status=active&type=subscription&limit=20
Response
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "obl_123",
        "type": "subscription",
        "title": "Netflix Subscription",
        "status": "active"
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 1
    }
  }
}

#### 6.2 POST /api/obligations

Create a new obligation from manual or assisted input.

Request
{
  "type": "renewal",
  "title": "Car Insurance Renewal",
  "vendor": "Geico",
  "dueDate": "2026-04-15T00:00:00.000Z",
  "source": "manual"
}
Response
{
  "success": true,
  "data": {
    "obligation": {
      "id": "obl_999",
      "type": "renewal",
      "title": "Car Insurance Renewal",
      "status": "active"
    }
  }
}

#### 6.3 GET /api/obligations/:id

Return a single obligation with detail.

Response
{
  "success": true,
  "data": {
    "obligation": {
      "id": "obl_123",
      "type": "subscription",
      "title": "Netflix Subscription",
      "vendor": "Netflix",
      "amount": 15.49,
      "dueDate": "2026-04-05T00:00:00.000Z",
      "confidenceScore": 0.94,
      "status": "active"
    }
  }
}

#### 6.4 PATCH /api/obligations/:id

Update obligation fields.

Request
{
  "title": "Netflix Premium",
  "dueDate": "2026-04-06T00:00:00.000Z"
}
Response
{
  "success": true,
  "data": {
    "obligation": {
      "id": "obl_123",
      "title": "Netflix Premium",
      "dueDate": "2026-04-06T00:00:00.000Z"
    }
  }
}

#### 6.5 POST /api/obligations/:id/confirm

Confirm a draft or low-confidence obligation.

Request
{
  "confirmed": true
}
Response
{
  "success": true,
  "data": {
    "obligation": {
      "id": "obl_123",
      "status": "active"
    }
  }
}

#### 6.6 POST /api/obligations/:id/postpone

Postpone an obligation.

Request
{
  "until": "2026-04-04T09:00:00.000Z",
  "reason": "Handle this on the weekend"
}
Response
{
  "success": true,
  "data": {
    "obligation": {
      "id": "obl_123",
      "status": "postponed"
    }
  }
}

#### 6.7 POST /api/obligations/:id/mark-done

Mark an obligation as handled or resolved.

Request
{
  "note": "Canceled externally"
}
Response
{
  "success": true,
  "data": {
    "obligation": {
      "id": "obl_123",
      "status": "resolved"
    }
  }
}

#### 6.8 POST /api/obligations/:id/dismiss

Dismiss an obligation from the feed without resolving it.

Request
{
  "reason": "dont_show_again"
}
Response
{
  "success": true,
  "data": {
    "obligation": {
      "id": "obl_123",
      "status": "ignored"
    }
  }
}

### 7. Today Feed APIs

#### 7.1 GET /api/today-feed

Return the current Today Feed.

Response
{
  "success": true,
  "data": {
    "generatedAt": "2026-04-02T12:05:00.000Z",
    "items": [
      {
        "id": "feed_123",
        "obligationId": "obl_123",
        "whyItMatters": "This renews tomorrow and may not be worth keeping.",
        "whatToDo": "Review before renewal.",
        "howHardIsIt": "low",
        "primaryAction": {
          "key": "review_subscription",
          "label": "Review subscription"
        },
        "secondaryActions": [
          {
            "key": "keep_for_now",
            "label": "Keep for now"
          }
        ],
        "rank": 1,
        "hookType": "money"
      }
    ]
  }
}

#### 7.2 POST /api/today-feed/refresh

Trigger feed regeneration.

Request
{}
Response
{
  "success": true,
  "data": {
    "jobTriggered": true
  }
}
Notes
For POC, this may be synchronous or async depending on implementation.

### 8. Resolution Flow APIs

#### 8.1 GET /api/obligations/:id/resolution

Return resolution guidance for an obligation.

Response
{
  "success": true,
  "data": {
    "obligationId": "obl_123",
    "recommendation": {
      "flowKey": "subscription.default",
      "recommendation": "Review Netflix before tomorrow to avoid the next charge.",
      "whyItMatters": "Recurring charges are easy to ignore.",
      "decisionOptions": [
        {
          "key": "keep",
          "label": "Keep subscription"
        },
        {
          "key": "cancel",
          "label": "Cancel subscription"
        }
      ],
      "recommendedOption": "cancel",
      "steps": [
        "Open billing settings.",
        "Review renewal date.",
        "Confirm cancellation if desired."
      ],
      "primaryAction": {
        "key": "open_resolution_flow",
        "label": "Review cancellation steps"
      },
      "secondaryActions": [
        {
          "key": "remind_me_tomorrow",
          "label": "Remind me tomorrow"
        }
      ]
    }
  }
}

### 9. Feedback APIs

#### 9.1 POST /api/feedback

Capture explicit feedback on a feed item or obligation recommendation.

Request
{
  "obligationId": "obl_123",
  "feedItemId": "feed_123",
  "type": "not_relevant",
  "note": "Already canceled last week"
}
Response
{
  "success": true,
  "data": {
    "feedbackEvent": {
      "id": "fbk_123",
      "type": "not_relevant",
      "createdAt": "2026-04-02T12:10:00.000Z"
    }
  }
}

### 10. Upload and Import APIs

#### 10.1 POST /api/uploads

Upload a document for extraction.

Request

multipart/form-data

Fields:

file
sourceType optional, e.g. bill, renewal, unknown
Response
{
  "success": true,
  "data": {
    "uploadId": "upl_123",
    "jobTriggered": true
  }
}
10.2 POST /api/imports/email-forward

Create an obligation candidate from forwarded email content.

Request
{
  "subject": "Your Netflix billing reminder",
  "from": "billing@netflix.com",
  "bodyText": "Your subscription renews tomorrow for $15.49"
}
Response
{
  "success": true,
  "data": {
    "candidateObligationId": "obl_321",
    "status": "draft"
  }
}

### 11. Reminder APIs

#### 11.1 POST /api/reminders

Create an internal reminder.

Request
{
  "obligationId": "obl_123",
  "title": "Review Netflix Subscription",
  "scheduledFor": "2026-04-03T09:00:00.000Z"
}
Response
{
  "success": true,
  "data": {
    "reminder": {
      "id": "rem_123",
      "status": "scheduled"
    }
  }
}

####11.2 GET /api/reminders

Return reminders for the current user.

Response
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "rem_123",
        "title": "Review Netflix Subscription",
        "scheduledFor": "2026-04-03T09:00:00.000Z",
        "status": "scheduled"
      }
    ]
  }
}

### 12. Error Contracts

#### 12.1 Validation Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input is invalid",
    "details": {
      "field": "dueDate"
    }
  }
}

#### 12.2 Not Found Error
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Obligation not found",
    "details": {}
  }
}

#### 12.3 Conflict Error
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Obligation is already resolved",
    "details": {}
  }
}
    
#### 12.4 Processing Error
{
  "success": false,
  "error": {
    "code": "PROCESSING_ERROR",
    "message": "Could not process uploaded document",
    "details": {}
  }
}

### 13. v1 API Design Rules

Keep endpoints resource-oriented where possible.
Keep command execution separate from raw command parsing.
Keep recommendation generation idempotent on read endpoints.
Keep feedback capture explicit and structured.
Prefer additive evolution over breaking response changes.
Return user-facing fields directly where they reduce frontend logic.

### 14. Deferred APIs for Later Phases

The following are intentionally deferred beyond v1:

Payment execution APIs
Vendor contact or negotiation APIs
OAuth inbox sync APIs
Bank or transaction sync APIs
Cross-channel messaging APIs
Broad automation APIs

### 15. Recommended v1 Implementation Order

GET /api/today-feed
GET /api/obligations
POST /api/obligations
GET /api/obligations/:id/resolution
POST /api/feedback
POST /api/reminders
POST /api/commands/parse
POST /api/commands/execute
POST /api/uploads

This order supports the Today Feed-first product strategy while keeping engineering risk low.
