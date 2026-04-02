# Admin-First Life Command Bar (LCB-A) — Resolution Flows

## 1. Purpose

This document defines the v1 Resolution Flow system for the Admin-First Life Command Bar (LCB-A).

Resolution Flows are the core product logic that turn obligations into:

1. decision support
2. recommended next actions
3. step-by-step guidance
4. user-visible relief

This document exists to ensure that flow behavior is:

- structured
- reusable
- measurable
- consistent across obligation types
- good enough to feel meaningfully better than a simple tracker or reminder list

---

## 2. Role of Resolution Flows in the Product

LCB-A is not a passive tracking system.

The Resolution Flow Engine is the component that converts:

```text
Obligation → Decision → Action → Resolution

Without strong flows, the product collapses into a list of items.


With strong flows, the product becomes an Admin Command OS that helps users:

understand why something matters
decide what to do
act with less friction
feel that something useful was handled

```
---

## 3. v1 Resolution Flow Principles

### 3.1 Core UX Principle

The system should always do more thinking than the user.

#### 3.2 Flow Quality Bar

Every v1 flow must:

1. reduce user thinking
2. remove at least one manual step
3. provide non-obvious guidance when possible
4. feel faster than doing it manually
5. produce a clear primary action in under 5 seconds of reading
6. avoid overwhelming the user with too many choices

#### 3.3 Simplicity Rule

Each flow should surface:

1 primary action
up to 2–3 secondary actions
1 default recommendation

#### 3.4 User Trust Rule

Every flow must make clear:

1. why the obligation matters
2. what the recommended action is
3. how hard the action is
4. what information the recommendation is based on

## 4. Resolution Flow Contract

Each flow instance should produce a normalized output object with the following fields.

### 4.1 Flow Output Contract

```typescript
interface ResolutionFlowOutput {
  flowKey: string;
  obligationId: string;
  obligationType: "bill" | "subscription" | "renewal" | "commitment";
  whyItMatters: string;
  recommendation: string;
  decisionOptions: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  recommendedOption: string;
  effortLevel: "low" | "medium" | "high";
  impactLevel: "low" | "medium" | "high";
  primaryAction: {
    key: string;
    label: string;
  };
  secondaryActions: Array<{
    key: string;
    label: string;
  }>;
  steps: string[];
  confidence: "high" | "medium" | "low";
  confidenceReason?: string;
}
```
---
## 5. Common Flow Inputs

The Resolution Flow Engine should evaluate the following inputs where available.

### 5.1 Required Inputs

1. obligation type
2. title
3. due date or renewal date
4. source
5. confidence score
6. obligation status

### 5.2 Optional Inputs
1. amount
2. recurrence
3. vendor
4. usage signal
5. historical feedback
6. unresolved age
7. prior postponements
8. similar prior obligations
9. user preference signals

## 6. Common Flow Outputs

Every flow must generate these user-facing elements.

### 6.1 Why It Matters

A concise explanation of urgency, money impact, penalty risk, or friction reduction.

### 6.2 Recommended Action

A single recommended path, framed clearly and concretely.

### 6.3 Decision Options

A limited set of user options, usually:

. keep / cancel / downgrade
. pay / review / dispute
. renew / replace / ignore
. do now / postpone / dismiss

### 6.4 Effort vs Impact

A simple expression of:

. effort required: low / medium / high
. expected impact: low / medium / high

### 6.5 Steps

Concrete steps that remove ambiguity and make progress feel easy.

## 7. v1 Flow Families

LCB-A v1 supports four primary flow families.

1. subscription flows
2. bill flows
3. renewal flows
4. commitment flows

## 8. Subscription Flows

### 8.1 Purpose

Help users handle recurring subscriptions without overpaying or forgetting to decide before renewal.

Typical examples
1. Netflix
2. Spotify
3. SaaS subscription
4. gym membership
5. premium app membership

### 8.2 Subscription Flow Triggers

A subscription flow should trigger when:

1. an obligation is typed as subscription
2. a recurring charge or renewal is detected
3. the user asks a subscription-related command such as:
    . "What subscriptions do I have?"
    . "Prepare to cancel Netflix"
    . "Is this worth keeping?"

### 8.3 Subscription Decision Options

Typical options:

1. keep
2. cancel
3. downgrade
4. remind later

Not every flow needs all options, but keep total visible options low.

### 8.4 Subscription Recommendation Logic (v1)

Use these signals when available:

1. renewal date proximity
2. amount
3. known usage signal
4. prior user preference
5. previous postponement
6. confidence in detection
Example heuristics
. If renewal is within 48 hours and no strong keep signal exists → lean toward review or cancel.
. If usage appears low and amount is non-trivial → elevate urgency and impact.
. If user previously kept a similar subscription → soften cancel recommendation.

### 8.5 Example — Weak vs Strong
Weak
You can keep or cancel Netflix.
Strong
Netflix renews tomorrow for $15.49. If you are not actively using it, cancel before renewal to avoid the next charge. This should take about 2 steps.

### 8.6 Example Subscription Flow Output
```json
{
  "flowKey": "subscription.default",
  "obligationId": "obl_123",
  "obligationType": "subscription",
  "whyItMatters": "This renews tomorrow and could charge you again if left unattended.",
  "recommendation": "Review Netflix before tomorrow and cancel if you are not using it.",
  "decisionOptions": [
    {
      "key": "keep",
      "label": "Keep subscription"
    },
    {
      "key": "cancel",
      "label": "Cancel subscription"
    },
    {
      "key": "downgrade",
      "label": "Downgrade plan"
    }
  ],
  "recommendedOption": "cancel",
  "effortLevel": "low",
  "impactLevel": "medium",
  "primaryAction": {
    "key": "review_cancellation_steps",
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
  ],
  "steps": [
    "Open the Netflix account page.",
    "Review the next billing date.",
    "Confirm cancellation if you no longer use the service."
  ],
  "confidence": "high",
  "confidenceReason": "Detected from direct user input with known vendor."
}
```

## 9. Bill Flows

### 9.1 Purpose

Help users handle bills before they become stressful, overdue, or penalty-prone.

Typical examples
credit card bill
utility bill
rent-like payment
phone bill
internet bill

### 9.2 Bill Flow Triggers

A bill flow should trigger when:

an obligation is typed as bill
a due date and payment context are detected
the user asks:
"Show my upcoming bills"
"What do I need to handle today?"
"What should I do about this?"

### 9.3 Bill Decision Options

Typical options:

pay
review
dispute
postpone reminder

### 9.4 Bill Recommendation Logic (v1)

Use these signals where available:

due date proximity
amount
penalty risk
whether amount looks typical
prior missed/postponed history
confidence
Example heuristics
If due within 72 hours → elevate urgency strongly.
If amount is unusually high compared with prior values → recommend review.
If due soon and no anomaly signal exists → recommend pay or prepare payment.

### 9.5 Example Bill Flow Output

```json
{
  "flowKey": "bill.default",
  "obligationId": "obl_456",
  "obligationType": "bill",
  "whyItMatters": "This bill is due in 2 days and may lead to fees or stress if delayed.",
  "recommendation": "Review the amount now and prepare to pay before the due date.",
  "decisionOptions": [
    {
      "key": "pay",
      "label": "Pay bill"
    },
    {
      "key": "review",
      "label": "Review details"
    },
    {
      "key": "dispute",
      "label": "Dispute if incorrect"
    }
  ],
  "recommendedOption": "review",
  "effortLevel": "medium",
  "impactLevel": "high",
  "primaryAction": {
    "key": "review_bill_details",
    "label": "Review bill details"
  },
  "secondaryActions": [
    {
      "key": "remind_tomorrow",
      "label": "Remind me tomorrow"
    },
    {
      "key": "mark_prepared",
      "label": "I’ll handle this"
    }
  ],
  "steps": [
    "Confirm due date and amount.",
    "Check whether the amount looks expected.",
    "Prepare payment or follow up if something looks wrong."
  ],
  "confidence": "high",
  "confidenceReason": "Detected from manual entry with explicit due date."
}
```

## 10. Renewal Flows

### 10.1 Purpose

Help users decide whether to renew, replace, or ignore expiring services or protections.

Typical examples
insurance renewal
warranty renewal
membership renewal
service plan renewal

### 10.2 Renewal Flow Triggers

A renewal flow should trigger when:

an obligation is typed as renewal
an expiration or renewal date is detected
the user asks:
"When does this renew?"
"Help me handle this"
"What’s the best option?"

### 10.3 Renewal Decision Options

Typical options:

renew
replace
ignore
remind later

### 10.4 Renewal Recommendation Logic (v1)

Use these signals where available:

renewal date proximity
cost if known
user history
whether replacement is realistic
penalty or risk of lapse
confidence
Example heuristics
If lapse risk is high and replacement not ready → lean toward renew.
If value is unclear and due date is not imminent → recommend review.
If user frequently postpones renewals → elevate urgency earlier.

### 10.5 Example Renewal Flow Output

```json
{
  "flowKey": "renewal.default",
  "obligationId": "obl_789",
  "obligationType": "renewal",
  "whyItMatters": "This renewal is coming soon and could lapse if you wait too long.",
  "recommendation": "Review whether to renew now or replace it before the deadline.",
  "decisionOptions": [
    {
      "key": "renew",
      "label": "Renew now"
    },
    {
      "key": "replace",
      "label": "Replace or switch"
    },
    {
      "key": "ignore",
      "label": "Ignore for now"
    }
  ],
  "recommendedOption": "renew",
  "effortLevel": "medium",
  "impactLevel": "high",
  "primaryAction": {
    "key": "review_renewal_options",
    "label": "Review renewal options"
  },
  "secondaryActions": [
    {
      "key": "remind_in_2_days",
      "label": "Remind in 2 days"
    }
  ],
  "steps": [
    "Confirm the renewal deadline.",
    "Check whether continuing coverage or service still matters.",
    "Renew now or prepare a replacement before the deadline."
  ],
  "confidence": "medium",
  "confidenceReason": "Renewal inferred from uploaded document with partial fields."
}
```

## 11. Commitment Flows

### 11.1 Purpose

Help users handle non-financial or lightly structured obligations that still create mental load.

Typical examples
a commitment the user manually added
a follow-up task with a time boundary
a non-billed personal obligation

### 11.2 Commitment Flow Triggers

A commitment flow should trigger when:

an obligation is typed as commitment
the user manually creates a task-like obligation
the user asks:
"What are my pending tasks?"
"Remind me about this"
"Help me handle this"

### 11.3 Commitment Decision Options

Typical options:

do now
postpone
dismiss
remind later

### 11.4 Commitment Recommendation Logic (v1)

Use these signals where available:

due date
effort estimate
unresolved age
prior postponement count
confidence
Example heuristics
If commitment is old and repeatedly postponed → surface as a quick-win or decision point.
If effort is low and impact is medium/high → elevate as a daily hook item.
If the system has weak confidence → ask for confirmation before strong guidance.

### 11.5 Example Commitment Flow Output

```json
{
  "flowKey": "commitment.default",
  "obligationId": "obl_999",
  "obligationType": "commitment",
  "whyItMatters": "This has been pending for several days and is still taking up mental space.",
  "recommendation": "Handle this now if it really takes only a few minutes, or postpone it intentionally.",
  "decisionOptions": [
    {
      "key": "do_now",
      "label": "Do now"
    },
    {
      "key": "postpone",
      "label": "Postpone intentionally"
    },
    {
      "key": "dismiss",
      "label": "Dismiss"
    }
  ],
  "recommendedOption": "do_now",
  "effortLevel": "low",
  "impactLevel": "medium",
  "primaryAction": {
    "key": "mark_starting_now",
    "label": "Do this now"
  },
  "secondaryActions": [
    {
      "key": "postpone_1_day",
      "label": "Postpone 1 day"
    },
    {
      "key": "dismiss_item",
      "label": "Dismiss"
    }
  ],
  "steps": [
    "Review what is actually required.",
    "If it is truly quick, do it now.",
    "If not, postpone it intentionally to a specific time."
  ],
  "confidence": "high",
  "confidenceReason": "Created directly by the user."
}
```

## 12. Confidence Handling in Flows

Confidence should be translated into user-facing behavior.

### 12.1 High Confidence

Use when:

source is manual or clearly parsed
obligation identity is clear
vendor/date/type are reliable

Behavior:

show recommendation directly
use assertive language
no extra confirmation needed

### 12.2 Medium Confidence

Use when:

some fields are inferred
obligation exists but details may be partial

Behavior:

show recommendation with softer wording
make edit/correct actions prominent

### 12.3 Low Confidence

Use when:

obligation identity is uncertain
due date/vendor/type may be wrong

Behavior:

ask for confirmation
avoid strong recommendation wording
prefer clarification over aggressive flowing

## 13. Flow Personalization Signals

The v1 system should begin storing and lightly using the following signals.

### 13.1 Supported Signals
user accepted recommendation
user rejected recommendation
user kept similar obligation before
user frequently postpones a flow type
user prefers reminders over immediate handling
user dismisses certain vendors/types repeatedly

### 13.2 v1 Personalization Rule

Use personalization to soften or strengthen guidance, but do not let personalization override obvious urgency or risk.

Example:

If a user previously kept a specific subscription several times, do not recommend cancel too aggressively unless urgency/usage signals justify it.

## 14. Failure and Recovery Within Flows

Every flow must support recovery when the recommendation is wrong or unhelpful.

### 14.1 Required Recovery Actions
not relevant
wrong info
fix details
don’t show again
mark done
postpone

### 14.2 Design Rule

Recovery actions must be easy, visible, and low-friction.

The user should never feel trapped in a bad recommendation.

## 15. Flow Selection Rules

The engine must map each obligation to one and only one primary flow family in v1.

### 15.1 Selection Order
explicit obligation type
source-specific structured cues
due date / recurrence pattern
command intent
fallback to clarification

### 15.2 Examples
subscription + recurring vendor → subscription flow
bill + amount + due date → bill flow
renewal + expiration date → renewal flow
user-added non-financial pending item → commitment flow

## 16. Fallback Flow Behavior

If a full high-quality flow is not available, the system must degrade gracefully.

### 16.1 Fallback Rule

The system should say, in effect:

I can track this and help you think through it, but I do not yet have a full resolution flow for this item.

### 16.2 Fallback Output Requirements

Fallback still needs to provide:

why it matters
best next step
reminder/postpone options
edit/feedback actions

This prevents unsupported items from feeling broken.

## 17. Flow Coverage Requirements for v1

To feel useful, v1 must support at least:

### 17.1 Subscription Coverage
streaming
SaaS
memberships

### 17.2 Bill Coverage
credit card
utilities
rent-like

### 17.3 Renewal Coverage
insurance
warranty
insurance-like

### 17.4 Commitment Coverage
manually created commitment
reminder-driven obligation

This yields roughly 8–10 strong flows minimum.

## 18. Metrics for Flow Quality

The Resolution Flow Engine should be evaluated with product and system metrics.

### 18.1 Product Metrics
action rate per flow type
postpone rate per flow type
dismiss rate per flow type
recommendation acceptance rate
“not relevant” rate
time to first action
perceived time saved
perceived money saved

### 18.2 Quality Signals

A flow is likely strong if:

users understand the recommendation quickly
users act without heavy manual correction
users rarely mark it as obvious or wrong
users report that it felt easier than expected

## 19. Open Questions for Later Phases

These do not block v1, but should be tracked.

When should we introduce vendor-specific flow templates?
When should external links or prefilled actions be dynamically generated?
How should low-risk automation plug into existing flow objects?
Should some flows become multi-step “journeys” in later phases?

## 20. Summary

Resolution Flows are the core differentiator of LCB-A.

They are what make the product feel like a command system instead of a tracking dashboard.

In v1, the Resolution Flow Engine must:

support a small number of high-quality flow families
keep decisions simple
surface one strong recommendation
reduce mental friction
improve through feedback signals over time

If the flows are weak, the product will feel like a list.

If the flows are strong, the product will feel like relief.