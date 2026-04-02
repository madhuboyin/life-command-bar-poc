# Admin-First Life Command Bar (LCB-A) — Product Requirements Document (PRD)

**Version:** v1.0  
**Date:** April 2026  
**Status:** Draft → Ready for Review  
**Derived from:** Feasibility Document v6 (Final)

## 1. Executive Summary & Product Vision

**Product Name:** Admin-First Life Command Bar (LCB-A)  
**Category:** Admin-First Life Command OS

**Vision**  
LCB-A is the daily command center for real-life admin. It detects obligations, intelligently prioritizes them, helps users decide what to do, and guides resolution — so users no longer have to keep mental lists of bills, subscriptions, renewals, and commitments.

**One-Line Positioning**  
“Your daily command center for real-life admin — the one place that tells you exactly what needs your attention today, helps you decide what to do, and shows you exactly how.”

**Core UX Principle**  
“The system should always do more thinking than the user.”

**Success Definition**  
After 3 days of use, users say:  
**“I don’t have to think about this stuff anymore.”**

## 2. Strategic Positioning

**❌ What We Are NOT**  
- Subscription tracker  
- Bill payment manager  
- Finance optimization tool  
- “Better Rocket Money”

**✅ What We ARE**  
Admin-First Life Command OS focused on **detect → prioritize → decide → resolve**.

## 3. Target Users & Personas

**Primary Persona:**  
- Alex (32, busy professional, tech worker in NYC)  
- Manages 15+ subscriptions, recurring bills, insurance renewals, and family commitments  
- Pain: Mental overload, fear of missing due dates, decision fatigue, late fees  
- Goal: Feel in control of life admin with minimal daily effort

**Secondary Persona:**  
- Sarah (45, small business owner + parent) – higher volume of obligations

## 4. Key Objectives & Success Metrics

### 4.1 Product Success Metrics (Go Criteria)
- ≥ 2 daily interactions per active user
- ≥ 40% 7-day retention
- ≥ 70% of new users see useful Today Feed within 2 minutes
- ≥ 50% of surfaced items acted upon
- Users report measurable relief (time/money saved)

### 4.2 Leading Indicators
- First Value Moment completion rate
- Relief Metrics surfaced & acknowledged
- Resolution Flow usage and acceptance rate
- Command bar usage frequency

## 5. Scope (v1 MVP)

### 5.1 In-Scope
- Natural language Command Bar
- Today Feed (3–5 focused items)
- Obligation Detection (manual + assisted + email forward)
- Resolution Flow Engine (minimum 8–10 high-quality flows)
- Feedback & Learning Layer
- Failure & Recovery Model
- Cold Start Strategy (value in ≤2 minutes)
- Relief Metrics
- Confidence UX Model

### 5.2 Out of Scope (v1)
- Autonomous payments or bank integrations
- Full email assistant
- Negotiation or vendor communication
- Mobile push notifications (Phase 2)

## 6. Detailed User Stories & Epics

### Epic 1: Cold Start & Onboarding
- As a new user, I can quickly add 3–5 obligations manually or forward emails so I get a useful Today Feed within 2 minutes.
- As a new user, I receive guided assistance to seed my first obligations.

### Epic 2: Daily Today Feed
- As a user, I open the app and immediately see 3–5 prioritized obligations with clear “Why / What / How hard” information.
- As a user, the feed always contains at least one high-urgency, money-related, or quick-win item.
- As a user, I can mark items as done, postponed, not relevant, or wrong with one tap.

### Epic 3: Resolution Flow Engine
- As a user, when I select an obligation or type a command (e.g., “Cancel Netflix”), the system triggers the appropriate structured resolution flow.
- As a user, I receive non-obvious, high-quality guidance that removes at least one manual step and feels faster than doing it myself.

**v1 Flow Coverage (Minimum 8–10 flows):**
- Subscriptions: Streaming (Netflix, Spotify), SaaS (Notion, Figma), Memberships (Gym)
- Bills: Credit Card, Utilities (Electricity, Internet), Rent/Mortgage-like
- Renewals: Insurance, Warranty/Registration

**Fallback:** Generic tracking + best manual next step + promise of future improvement.

### Epic 4: Command Bar
- As a user, I can use natural language to ask questions, add obligations, or trigger actions (“What do I need to handle today?”, “Prepare to cancel X”, “Is this worth keeping?”).
- Every command maps to: existing obligation, new obligation, resolution flow, or clarification.

### Epic 5: Feedback & Learning
- As a user, my actions (accept/reject/modify/complete) improve future recommendations.
- The system learns my preferences over time.

### Epic 6: Trust & Transparency
- As a user, every item shows Confidence level + explanation.
- As a user, I can easily correct or dismiss incorrect items.

## 7. Detailed User Flows

### 7.1 Cold Start Flow
1. Sign up / Onboard (minimal questions)
2. Prompt: “Let’s get you set up in under 2 minutes”
3. Options: Quick-add common items OR forward 1–2 emails OR manual entry
4. System immediately generates Today Feed with 2–3 actionable items
5. First Relief Metric shown after completing first item

### 7.2 Daily Ritual Flow (Today Feed)
1. Open app → Today Feed loads (<1.5s)
2. Scan 3–5 cards, each showing:
   - Title + Due date
   - Why it matters (Impact)
   - Recommended action (primary button)
   - Effort level + Confidence
3. Tap primary action → Enter Resolution Flow
4. Complete or dismiss → Feedback captured

### 7.3 Resolution Flow (Example: Netflix Cancellation)
1. User triggers via Command or Feed
2. System shows context-aware insight (“You haven’t used it in 18 days…”)
3. Decision support: Keep / Cancel / Downgrade (with pros/cons)
4. If Cancel chosen → Step-by-step guided path (links, what to expect, time estimate)
5. User completes externally → Marks as done → Relief metric updated

## 8. Data Model (High-Level)

**Core Entity: Obligation**
- ID, Type (subscription/bill/renewal/commitment)
- Description, Vendor, Amount, Due Date
- Status, Urgency Score, Importance Score, Effort Score, Confidence Score
- Source (manual/email/upload), History Log
- Resolution Flow Type & Last Used

## 9. Non-Functional Requirements
- Command response time: < 2 seconds
- Today Feed load: < 1.5 seconds
- First value: ≤ 2 minutes from signup
- Resolution guidance: Primary action in < 5 seconds
- Security & Privacy: Encryption, user-controlled data, minimal collection
- Reliability: ≥ 95% correctness on confirmed obligations

## 10. Prioritization (MoSCoW)

**Must Have (MVP Core)**
- Today Feed with 3–5 items
- Command Bar with basic intent handling
- Minimum 8–10 Resolution Flows meeting Quality Bar
- Cold Start (value in 2 min)
- Confidence UX + Failure Recovery
- Feedback & Learning basics

**Should Have**
- Relief Metrics surfacing
- Multi-turn conversation in flows
- Basic pattern detection in cold start

**Could Have**
- Document upload improvements
- Exportable action summaries

**Won’t Have (v1)**
- Autonomous execution
- Bank integrations

## 11. Assumptions & Dependencies
- LLM capabilities for intent classification and structured output (GPT-4o class or equivalent)
- Secure user data storage
- Users willing to do light manual seeding initially

## 12. Risks & Mitigations
(See Feasibility Document v6 Risk Matrix)

## 13. Roadmap Overview
- **v1 (MVP):** Core Today Feed + Command Bar + 8–10 Resolution Flows + Learning basics
- **v1.1:** Improved flow coverage + mobile optimization
- **v2:** Low-risk action execution + more integrations

---

**Approval Section**

- Product Owner: ____________________ Date: ________
- Engineering Lead: ________________ Date: ________
- Design Lead: _____________________ Date: ________

**Next Steps After PRD Approval:**
1. UI/UX Wireframes & Visual Design
2. Technical Architecture & Data Model Deep Dive
3. Sprint Planning & Backlog Refinement
4. Prototyping of Today Feed + First Resolution Flows

---

This PRD is **ready to use**. It directly builds on the Feasibility Document v6 and provides clear, actionable requirements for design and engineering teams.
