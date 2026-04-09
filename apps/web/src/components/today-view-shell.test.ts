import assert from "node:assert/strict";
import test from "node:test";
import type { DailyCommandCenterResponse } from "../lib/types";
import { shouldShowHeaderUpcomingAction } from "./today-view-shell.helpers";

function createToday(
  overrides: Partial<DailyCommandCenterResponse>
): DailyCommandCenterResponse {
  return {
    generatedAt: "2026-04-08T00:00:00.000Z",
    todayState: "CLEAR",
    headline: "You're all set for now",
    subheadline: "Nothing needs your attention today.",
    primaryItem: null,
    queuedItems: [],
    nextUp: null,
    viewUpcomingAvailable: true,
    summary: {
      todayCount: 0,
      urgentCount: 0,
      reviewCount: 0,
      upcomingCount: 0,
      completedTodayCount: 0
    },
    primaryItems: [],
    upcoming: [],
    completedOrSafe: [],
    pulse: {
      openedToday: true,
      totalItems: 0,
      remainingCount: 0,
      completedCount: 0
    },
    ...overrides
  };
}

test("header upcoming action is suppressed in all-clear state", () => {
  const data = createToday({
    todayState: "CLEAR",
    viewUpcomingAvailable: true,
    primaryItem: null
  });
  assert.equal(shouldShowHeaderUpcomingAction(data), false);
});

test("header upcoming action appears for non-clear active loop states", () => {
  const data = createToday({
    todayState: "ONE_ITEM",
    primaryItem: {
      id: "item_1",
      itemType: "OBLIGATION",
      title: "Pay electricity",
      subtitle: null,
      category: "BILL",
      vendorName: null,
      amount: null,
      currency: null,
      dueDate: null,
      renewalDate: null,
      priorityScore: 88,
      priorityBand: "HIGH",
      confidenceBand: "HIGH",
      primaryAction: {
        key: "MARK_DONE",
        label: "Handle now",
        mode: "INLINE"
      },
      secondaryActions: [],
      whyNow: "This is due soon.",
      whyThisMatters: "Handling this now keeps today lighter.",
      sourceSummary: "Found from recent obligation activity.",
      scopeType: "PERSONAL",
      presentationStyle: "DEFAULT",
      reminderStyle: "DEFAULT",
      personalization: {
        basePriorityScore: 88,
        finalPriorityScore: 88,
        personalizationApplied: false,
        presentationStyle: "DEFAULT",
        reminderStyle: "DEFAULT",
        adjustments: []
      },
      assignee: null
    }
  });
  assert.equal(shouldShowHeaderUpcomingAction(data), true);
});
