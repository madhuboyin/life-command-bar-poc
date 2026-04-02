# Admin-First Life Command Bar (LCB-A) — Today Feed Ranking

## 1. Purpose

This document defines how the Today Feed is generated and ranked in v1 of the Admin-First Life Command Bar (LCB-A).

The Today Feed is the primary product surface and habit engine. Its job is not to show everything. Its job is to show only the small set of obligations that are most worth the user’s attention right now.

<b>This document defines:</b>

1. ranking goals
2. candidate selection rules
3. scoring dimensions
4. feed composition rules
5. hook item rules
6. suppression and recovery behavior
7. evaluation metrics

---

## 2. Role of the Today Feed

The Today Feed is not a task list and not an inbox.

It is the daily control surface that answers:

1. What matters today?
2. What should I do first?
3. What is worth my attention now?
4. What can I handle quickly?

If the Today Feed is weak, the product feels like a tracker.
If the Today Feed is strong, the product feels like relief.

---

## 3. Core Feed Principles

### 3.1 Focus Over Completeness

The feed should prioritize usefulness, not coverage.

The system should show only **3–5 items by default**.

### 3.2 Actionability Over Information Density

Every feed item must support action, not just awareness.

### 3.3 Decision Support Over Raw Sorting

The feed should not simply sort by due date.
It should rank based on what is most worth handling now.

### 3.4 Daily Hook Requirement

Every feed must include at least one item that feels worth opening the app for.

This can be:

1. an urgent item
2. a money-related item
3. a high-confidence quick win

### 3.5 The Feed Must Feel Lighter Than Life Admin

The user should feel:

> “Good, now I know what to handle.”

not:

> “Now I have another list to manage.”

---

## 4. Feed Output Requirements

Each Today Feed item must answer these questions instantly:

1. Why does this matter?
2. What should I do?
3. How hard is it?

Each item should include:

1. obligation summary
2. why-it-matters text
3. recommended action
4. effort level
5. impact level
6. confidence
7. primary action
8. up to 2–3 secondary actions

---

## 5. Ranking Goals

The Today Feed ranking system must optimize for:

1. user relevance
2. urgency
3. actionability
4. relief potential
5. habit formation
6. low cognitive load

The feed must not optimize only for date sorting or item count.

---

## 6. Ranking Pipeline Overview

The Today Feed ranking pipeline has five stages:

```text
Active Obligations
  → Eligibility Filter
  → Candidate Scoring
  → Hook Item Selection
  → Feed Composition Rules
  → Final 3–5 Items

```
---

## 7. Ranking Pipeline

### Eligibility Filter

Before ranking, the system filters obligations into a candidate set.

7.1 Eligible Obligations

An obligation is eligible if:

- status is active or postponed and due again soon
- confidence is not below minimum threshold, unless user-created
- it is not permanently dismissed
- it is not already resolved
- it is not suppressed by recent feedback
- it has enough information to generate meaningful guidance

---
### 7.2 Excluded Obligations

An obligation should be excluded if:

- status is resolved
- user selected dont_show_again
- it was marked not_relevant recently and no new evidence exists
- it was shown very recently without any meaningful change
- confidence is too low and clarification is required first

---

## 8. Ranking Dimensions

The ranking model in v1 should be explicit and interpretable.

Each candidate obligation should be scored across these dimensions:

- urgency
- importance
- confidence
- effort
- quick-win potential
- unresolved age
- personalization adjustment
- suppression penalty

---

## 9. Urgency Score

### 9.1 Purpose

Urgency estimates how time-sensitive the obligation is.

### 9.2 Typical Inputs

- due date proximity
- renewal date proximity
- risk of penalty or lapse
- prior postponements
- whether the item has become more urgent since last shown

### 9.3 Example Heuristics

- Due within 24 hours → very high urgency
- Due within 72 hours → high urgency
- Due within 7 days → medium urgency
No due date → lower urgency unless other signals elevate it

### 9.4 Output

A normalized score, for example 0–100

---

## 10. Importance Score

### 10.1 Purpose

Importance estimates how much the obligation matters if handled or ignored.

### 10.2 Typical Inputs

- money at stake
- penalty risk
- coverage/lapse risk
- recurrence
- user-specific value
- obligation type

### 10.3 Example Heuristics

- High dollar amount or high consequence → high importance
- Insurance renewal or major bill → higher importance
- Small subscription with low consequences → medium or low importance

### 10.4 Output

A normalized score, for example 0–100

---

## 11. Confidence Score

### 11.1 Purpose

Confidence estimates how trustworthy the obligation and recommendation are.

### 11.2 Typical Inputs

- input source
- extraction quality
- field completeness
- user confirmation history
- vendor certainty
- date certainty

### 11.3 Confidence UX Behavior

- High Confidence
  - show directly
  - use stronger recommendation wording
- Medium Confidence
  - show with softer language
  - keep edit/correction affordances visible
- Low Confidence
  - prefer clarification or confirmation before ranking highly

---

## 12. Effort Score

### 12.1 Purpose

Effort estimates how hard the item feels to handle right now.

### 12.2 Typical Inputs

- expected number of steps
- need for external action
- ambiguity in resolution path
- whether the system already has prepared guidance
- whether it is a simple review vs a deeper decision

### 12.3 Feed Use Case

- Effort should not always reduce rank.
- Low-effort items can become quick wins and create momentum.
- High-effort items may still rank high if urgency or importance is strong.

---

## 13. Quick-Win Potential

### 13.1 Purpose

Quick-win potential estimates whether an item can provide immediate relief with low effort.

### 13.2 Typical Inputs

- low effort
- medium/high impact
- high confidence
- simple next step
- likely to produce visible relief

### 13.3 Examples

- Cancel or review a small subscription before renewal
- Confirm and schedule a reminder for a bill
- Mark a nearly done obligation as resolved

Quick wins are important because they help the feed feel rewarding and habit-forming.

---

## 14. Unresolved Age

### 14.1 Purpose

Unresolved age estimates how long an obligation has been lingering.

### 14.2 Use

Old items that have been ignored or postponed repeatedly may deserve a boost, but not if they create noise.

### 14.3 Rule

Unresolved age should boost rank only when paired with one of:

- real impact
- real urgency
- low effort
- strong confidence

This prevents stale clutter from dominating the feed.

---

## 15. Personalization Adjustment

### 15.1 Purpose

Personalization lightly adjusts ranking based on user behavior.

### 15.2 Typical Inputs

- prior acceptance/rejection of similar recommendations
- vendor-specific history
- habitual postponement patterns
- preference for reminders vs immediate action
- historical interaction rate by obligation type

### 15.3 v1 Rule

Personalization should be conservative.
It should tune rank, not override obvious urgency or importance.

---

## 16. Suppression Penalty

### 16.1 Purpose

Suppression reduces ranking for obligations the user has recently rejected, postponed, or dismissed.

### 16.2 Typical Triggers

- not_relevant
- repeated not_relevant
- dont_show_again
- repeated explicit rejection
- recent display with no meaningful change

### 16.3 v1 Rule

A suppressed item may return if:

- its due date becomes meaningfully closer
- new information appears
- the user explicitly asks about it
- suppression window expires

---

## 17. Proposed v1 Ranking Formula

The exact numbers can evolve, but v1 should begin with an interpretable weighted score.

### 17.1 Candidate Score
```
candidate_score =
  (urgency_weight * urgency_score) +
  (importance_weight * importance_score) +
  (confidence_weight * confidence_score_normalized) +
  (quick_win_weight * quick_win_score) +
  (age_weight * unresolved_age_score) +
  (personalization_weight * personalization_adjustment) -
  (effort_penalty_weight * effort_penalty) -
  (suppression_weight * suppression_penalty)
```
---
### 17.2 Suggested Initial Weights

These are starting points, not permanent truth.
```
urgency_weight = 0.30
importance_weight = 0.25
confidence_weight = 0.15
quick_win_weight = 0.15
age_weight = 0.05
personalization_weight = 0.05
effort_penalty_weight = 0.03
suppression_weight = 0.02
```
---
### 17.3 Interpretation

- urgency and importance should dominate
- confidence matters because trust matters
- quick wins matter because habit matters
- effort reduces rank only slightly
- suppression prevents noisy repetition

---

## 18. Hook Item Selection

The feed must always include at least one hook item.

### 18.1 Hook Item Types

A hook item is an item that strongly justifies opening the app today.

<b>Eligible hook types:</b>

- urgent
- money-related
- quick win
- relief-rich item

### 18.2 Hook Selection Rule

If the top ranked items do not naturally include a hook item, inject the highest-ranked eligible hook item into the feed.

### 18.3 Why This Exists

Without a hook item, the feed feels too calm and users may not return daily.

---

## 19. Feed Composition Rules

After scoring, the system must compose the final feed intentionally.

### 19.1 Default Feed Size

Show 3–5 items by default.

### 19.2 Composition Rules

The final feed should aim to include:

- at least one high-urgency or high-importance item
- at least one hook item
- at least one low-effort or medium-effort item when possible
- no more than one or two highly similar items in a row
- no more than one low-confidence item unless explicitly confirmed

### 19.3 Diversity Rule

Avoid showing:

- three identical subscription-like items in a row
- too many low-importance items
- too many unresolved stale items

The feed should feel varied but coherent.

---

## 20. Feed Suppression Rules

The Today Feed should avoid repeatedly surfacing unhelpful items.

### 20.1 Temporary Suppression

Use temporary suppression when the user:

postpones an item
ignores it
rejects a recommendation

### 20.2 Permanent Suppression

Use stronger suppression when the user selects:

- dont_show_again
- repeated not_relevant

### 20.3 Suppression Expiry

Temporary suppression may expire when:

- due date approaches materially
- urgency crosses a threshold
- new evidence changes the recommendation
- a new day passes and the item still qualifies strongly

---

## 21. Clarification and Low-Confidence Handling

The ranking engine should not aggressively surface low-confidence items without support.

### 21.1 Rule

If confidence is low and the item cannot be explained clearly, prefer:

- clarification
- draft/candidate state
- manual confirmation

instead of ranking it into the Today Feed.

### 21.2 Exception

If the user manually created the obligation, confidence issues should not block display.

---

## 22. Feed Refresh Triggers

The Today Feed should be refreshed when any of the following happens:

- obligation created
- obligation updated
- feedback submitted
- reminder created or changed
- document/email import completes
- user explicitly refreshes
- scheduled daily refresh runs

---

## 23. Compute Strategy for v1

### 23.1 Recommended v1 Approach

Compute feed on read with light caching.

### 23.2 Why

This keeps the implementation simple and responsive to recent changes.

### 23.3 Optional Cache Behavior

Cache for a short duration, for example 1–5 minutes, unless invalidated by:

- obligation mutation
- feedback event
- new import result

---

## 24. Fallback Behavior

If ranking inputs are incomplete, the system must still produce a usable feed.

### 24.1 Fallback Rule

A feed item may still be shown if the system can confidently answer:

- why it matters
- what to do next
- how hard it is

even if some deeper ranking signals are missing.

### 24.2 Degraded Mode Example

If the amount is unknown but due date is clear:

urgency can still rank the item strongly
confidence should reflect missing details
explanation should stay honest

---

## 25. Examples

### 25.1 Example Candidate Set

<b>Candidate set</b>

Suppose the user has:

1. Netflix renews tomorrow
2. Credit card bill due in 2 days
3. Car insurance renewal in 5 days
4. Old low-value commitment postponed 3 times
5. Internet bill due in 8 days

<b>Likely ranked output</b>

1. Credit card bill
2. Netflix subscription
3. Car insurance renewal
4. Old commitment as quick-win if effort is low
5. Internet bill may stay out of feed for now

This produces a focused feed instead of a noisy list.

---

## 26. Anti-Patterns

The Today Feed should avoid these failure modes:

### 26.1 Date-Only Sorting

This produces predictable but weak feeds.

### 26.2 Too Many Items

Showing everything creates dashboard fatigue.

### 26.3 Too Many Low-Value Items

Users lose trust if the feed feels trivial.

### 26.4 Too Many Similar Items

The feed feels repetitive and boring.

### 26.5 Surfacing Weak Recommendations

If a recommendation is obvious, generic, or unsupported, it weakens the product.

---

## 27. Metrics for Ranking Quality

The ranking system should be evaluated continuously.

### 27.1 Primary Metrics
- feed action rate
- primary action click-through rate
- time to first action
- daily interactions per user
- repeat daily opens
- percentage of feed items acted upon

### 27.2 Trust and Noise Metrics
- not_relevant rate
- low-confidence item rate
- dismissal rate
- repeated surfacing rate
- correction rate

### 27.3 Relief Metrics
- time saved
- tasks resolved per day
- estimated time saved
- estimated money saved
- avoided penalties
- user-reported mental relief

---

## 28. Tuning Strategy for v1

Ranking should be tuned gradually and transparently.

### 28.1 Recommended Tuning Order
- fix obvious noise and suppression bugs
- improve hook item quality
- improve urgency and importance scoring
- improve quick-win detection
- add light personalization adjustments

### 28.2 v1 Tuning Philosophy

Prefer simple, understandable tuning over black-box ranking complexity.

---

## 29. Open Questions

These questions do not block v1, but should be tracked.

- Should unresolved age matter more for commitments than for bills?
- How aggressively should quick wins be surfaced versus important but harder items?
- When should personalization have visible impact?
- Should feed diversity be explicitly optimized or kept heuristic-based?

---

## 30. Summary

The Today Feed is the habit engine of LCB-A.

Its success depends on five things:

- strong filtering
- interpretable ranking
- hook item inclusion
- strict 3–5 item focus
- trust-preserving suppression and recovery rules

The feed should not feel like a list of obligations.

It should feel like:

“Here are the few things worth handling now, and here is the easiest way to start.”