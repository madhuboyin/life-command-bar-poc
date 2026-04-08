import assert from "node:assert/strict";
import test from "node:test";
import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  ObligationStatus,
  ScopeType
} from "@prisma/client";
import { PersonalizationPolicyService } from "./personalization-policy.service";
import type { TodayPrioritizedItem } from "./today-prioritization.service";
import { UNKNOWN_BEHAVIOR_PROFILE } from "../types/personalization-policy.types";

const FIXED_NOW = new Date("2026-03-15T12:00:00.000Z");

function createItem(input: Partial<TodayPrioritizedItem> = {}): TodayPrioritizedItem {
  return {
    id: input.id ?? "obl_1",
    itemType: input.itemType ?? "OBLIGATION",
    title: input.title ?? "Pay utility",
    subtitle: input.subtitle ?? null,
    category: input.category ?? "BILL",
    type: input.type ?? "BILL",
    status: input.status ?? ObligationStatus.ACTIVE,
    vendorName: input.vendorName ?? null,
    amount: input.amount ?? 20,
    currency: input.currency ?? "USD",
    dueDate: input.dueDate ?? "2026-03-25T00:00:00.000Z",
    renewalDate: input.renewalDate ?? null,
    priorityHintScore: input.priorityHintScore ?? 0,
    confidenceBand: input.confidenceBand ?? "HIGH",
    confidenceScore: input.confidenceScore ?? 0.9,
    urgencyScore: input.urgencyScore ?? 40,
    importanceScore: input.importanceScore ?? 45,
    needsReview: input.needsReview ?? false,
    sourceSummary: input.sourceSummary ?? "source",
    scopeType: input.scopeType ?? ScopeType.PERSONAL,
    assignee: input.assignee ?? null,
    lastActedAt: input.lastActedAt ?? null,
    subscriptionId: input.subscriptionId ?? null,
    priorityScore: input.priorityScore ?? 80,
    priorityBand: input.priorityBand ?? "HIGH",
    primaryAction: input.primaryAction ?? {
      key: "MARK_DONE",
      label: "Handle now",
      mode: "INLINE"
    },
    secondaryActions: input.secondaryActions ?? [],
    whyNow: input.whyNow ?? "Due this week",
    whyThisMatters: input.whyThisMatters ?? "Avoid surprises"
  };
}

function createService() {
  return new PersonalizationPolicyService({
    now: () => FIXED_NOW,
    flags: {
      enableRanking: true,
      enableMessaging: true,
      enableReminderTuning: true
    }
  });
}

test("QUICK_ACTION and FAST profiles nudge direct-action items up", () => {
  const service = createService();

  const direct = createItem({
    id: "direct",
    title: "Direct",
    primaryAction: {
      key: "MARK_DONE",
      label: "Handle now",
      mode: "INLINE"
    }
  });
  const review = createItem({
    id: "review",
    title: "Review",
    primaryAction: {
      key: "REVIEW",
      label: "Review",
      mode: "NAVIGATE"
    },
    needsReview: true,
    confidenceBand: "LOW"
  });

  const result = service.applyTodayViewPersonalization({
    items: [direct, review],
    profile: {
      actionSpeed: BehaviorActionSpeed.FAST,
      reviewPreference: BehaviorReviewPreference.QUICK_ACTION,
      deferFrequency: BehaviorDeferFrequency.LOW
    },
    now: FIXED_NOW
  });

  assert.equal(result.items[0]?.id, "direct");
  assert.equal(result.items[0]?.presentationStyle, "COMPACT_ACTION");
  assert.equal(result.rankingPersonalizationApplied, true);
});

test("REVIEW_FIRST profile nudges review-first items with supported style", () => {
  const service = createService();

  const direct = createItem({
    id: "direct",
    title: "Direct",
    primaryAction: {
      key: "MARK_DONE",
      label: "Handle now",
      mode: "INLINE"
    }
  });
  const review = createItem({
    id: "review",
    title: "Review",
    primaryAction: {
      key: "REVIEW",
      label: "Review",
      mode: "NAVIGATE"
    },
    needsReview: true,
    confidenceBand: "LOW"
  });

  const result = service.applyTodayViewPersonalization({
    items: [direct, review],
    profile: {
      actionSpeed: BehaviorActionSpeed.SLOW,
      reviewPreference: BehaviorReviewPreference.REVIEW_FIRST,
      deferFrequency: BehaviorDeferFrequency.UNKNOWN
    },
    now: FIXED_NOW
  });

  assert.equal(result.items[0]?.id, "review");
  assert.equal(result.items[0]?.presentationStyle, "SUPPORTED_REVIEW");
});

test("HIGH defer profile reduces weak non-urgent clutter", () => {
  const service = createService();

  const clutter = createItem({
    id: "clutter",
    title: "Low value",
    priorityBand: "MEDIUM",
    priorityScore: 60,
    amount: 12,
    confidenceBand: "HIGH",
    needsReview: false,
    dueDate: null,
    renewalDate: null
  });

  const result = service.applyTodayViewPersonalization({
    items: [clutter],
    profile: {
      actionSpeed: BehaviorActionSpeed.UNKNOWN,
      reviewPreference: BehaviorReviewPreference.UNKNOWN,
      deferFrequency: BehaviorDeferFrequency.HIGH
    },
    now: FIXED_NOW
  });

  assert.equal(result.items[0]?.personalization.finalPriorityScore, 57);
  assert.equal(result.items[0]?.reminderStyle, "REALISTIC_FOLLOWUP");
});

test("urgent items are not demoted by defer-frequency personalization", () => {
  const service = createService();

  const urgent = createItem({
    id: "urgent",
    priorityBand: "URGENT",
    priorityScore: 100,
    dueDate: "2026-03-15T18:00:00.000Z",
    amount: 10,
    confidenceBand: "HIGH",
    needsReview: false
  });

  const result = service.applyTodayViewPersonalization({
    items: [urgent],
    profile: {
      actionSpeed: BehaviorActionSpeed.UNKNOWN,
      reviewPreference: BehaviorReviewPreference.UNKNOWN,
      deferFrequency: BehaviorDeferFrequency.HIGH
    },
    now: FIXED_NOW
  });

  assert.equal(result.items[0]?.personalization.finalPriorityScore, 100);
  assert.equal(result.items[0]?.reminderStyle, "DEFAULT");
});

test("UNKNOWN profile cleanly falls back to baseline without style changes", () => {
  const service = createService();

  const base = createItem({ id: "base", priorityScore: 74 });
  const result = service.applyTodayViewPersonalization({
    items: [base],
    profile: UNKNOWN_BEHAVIOR_PROFILE,
    now: FIXED_NOW
  });

  assert.equal(result.personalizationApplied, false);
  assert.equal(result.items[0]?.personalization.basePriorityScore, 74);
  assert.equal(result.items[0]?.personalization.finalPriorityScore, 74);
  assert.equal(result.items[0]?.presentationStyle, "DEFAULT");
  assert.equal(result.items[0]?.reminderStyle, "DEFAULT");
});

test("policy feature flags can cleanly disable all personalization adjustments", () => {
  const service = new PersonalizationPolicyService({
    now: () => FIXED_NOW,
    flags: {
      enableRanking: false,
      enableMessaging: false,
      enableReminderTuning: false
    }
  });

  const base = createItem({
    id: "flagged",
    needsReview: true,
    confidenceBand: "LOW",
    primaryAction: {
      key: "REVIEW",
      label: "Review",
      mode: "NAVIGATE"
    }
  });

  const result = service.applyTodayViewPersonalization({
    items: [base],
    profile: {
      actionSpeed: BehaviorActionSpeed.FAST,
      reviewPreference: BehaviorReviewPreference.QUICK_ACTION,
      deferFrequency: BehaviorDeferFrequency.HIGH
    },
    now: FIXED_NOW
  });

  assert.equal(result.personalizationApplied, false);
  assert.equal(result.items[0]?.presentationStyle, "DEFAULT");
  assert.equal(result.items[0]?.reminderStyle, "DEFAULT");
  assert.equal(
    result.items[0]?.personalization.finalPriorityScore,
    result.items[0]?.personalization.basePriorityScore
  );
});

test("today reminder scheduling uses deterministic style windows", () => {
  const service = createService();

  const shortFollowup = service.resolveTodayReminderSchedule({
    profile: {
      actionSpeed: BehaviorActionSpeed.FAST,
      reviewPreference: BehaviorReviewPreference.QUICK_ACTION,
      deferFrequency: BehaviorDeferFrequency.LOW
    },
    now: FIXED_NOW
  });

  const realisticFollowup = service.resolveTodayReminderSchedule({
    profile: {
      actionSpeed: BehaviorActionSpeed.SLOW,
      reviewPreference: BehaviorReviewPreference.UNKNOWN,
      deferFrequency: BehaviorDeferFrequency.HIGH
    },
    now: FIXED_NOW
  });

  assert.equal(shortFollowup.reminderStyle, "SHORT_FOLLOWUP");
  assert.equal(
    shortFollowup.remindAt.toISOString(),
    new Date(FIXED_NOW.getTime() + 16 * 60 * 60 * 1000).toISOString()
  );
  assert.equal(realisticFollowup.reminderStyle, "REALISTIC_FOLLOWUP");
  assert.equal(
    realisticFollowup.remindAt.toISOString(),
    new Date(FIXED_NOW.getTime() + 72 * 60 * 60 * 1000).toISOString()
  );
});

test("reminder guardrail never pushes reminders past urgent due window", () => {
  const service = createService();

  const decision = service.resolveSubscriptionReminderSchedule({
    profile: {
      actionSpeed: BehaviorActionSpeed.SLOW,
      reviewPreference: BehaviorReviewPreference.REVIEW_FIRST,
      deferFrequency: BehaviorDeferFrequency.HIGH
    },
    nextRenewalDate: "2026-03-16T12:00:00.000Z",
    now: FIXED_NOW
  });

  assert.equal(decision.reminderStyle, "REALISTIC_FOLLOWUP");
  // Renewal is one day away, so guardrail clamps to renewal minus 6 hours.
  assert.equal(
    decision.remindAt.toISOString(),
    new Date("2026-03-16T06:00:00.000Z").toISOString()
  );
});
