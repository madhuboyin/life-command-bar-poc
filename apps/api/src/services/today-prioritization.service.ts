import {
  AnchorCategory,
  ObligationStatus,
  ScopeType
} from "@prisma/client";
import type { AnchorDueReason, AnchorDueUrgency } from "../types/anchor-tracking.types";

export type TodayPriorityBand = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export type TodayAction = {
  key:
    | "REVIEW"
    | "REVIEW_SUBSCRIPTION"
    | "MARK_DONE"
    | "OPEN_GUIDED"
    | "REMIND_LATER"
    | "DISMISS"
    | "VIEW_DETAILS";
  label: string;
  mode: "INLINE" | "NAVIGATE" | "GUIDED";
  href?: string;
};

export type TodayPrioritizationInput = {
  id: string;
  itemType: "OBLIGATION" | "SUBSCRIPTION_REVIEW" | "TRACKED_ANCHOR";
  title: string;
  subtitle: string | null;
  category: string;
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  status: ObligationStatus;
  vendorName: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  renewalDate: string | null;
  priorityHintScore: number | null;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  confidenceScore: number;
  urgencyScore: number;
  importanceScore: number;
  needsReview: boolean;
  sourceSummary: string;
  scopeType: ScopeType;
  assignee:
    | {
        id: string;
        email: string;
        name: string | null;
      }
    | null;
  lastActedAt: string | null;
  subscriptionId: string | null;
  trackedAnchor?: {
    anchorId: string;
    category: AnchorCategory;
    dueReason: AnchorDueReason;
    dueUrgency: AnchorDueUrgency;
    recurrenceType: "RECURRING" | "ONE_TIME" | "UNKNOWN";
    timingKnown: boolean;
  };
};

export type TodayPrioritizedItem = TodayPrioritizationInput & {
  priorityScore: number;
  priorityBand: TodayPriorityBand;
  primaryAction: TodayAction;
  secondaryActions: TodayAction[];
  whyNow: string;
  whyThisMatters: string;
};

export class TodayPrioritizationService {
  rank(inputs: TodayPrioritizationInput[], now = new Date()): TodayPrioritizedItem[] {
    const ranked = inputs.map((item) => {
      const score = scoreItem(item, now);
      const priorityBand = toPriorityBand(score);
      const { primaryAction, secondaryActions } = selectActions(item, priorityBand);

      return {
        ...item,
        priorityScore: score,
        priorityBand,
        primaryAction,
        secondaryActions,
        whyNow: buildWhyNow(item, now),
        whyThisMatters: buildWhyThisMatters(item)
      };
    });

    ranked.sort((a, b) => {
      const scoreDelta = b.priorityScore - a.priorityScore;
      if (scoreDelta !== 0) return scoreDelta;

      const dueA = daysUntil(a.dueDate, now) ?? Number.MAX_SAFE_INTEGER;
      const dueB = daysUntil(b.dueDate, now) ?? Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;

      const renewalA = daysUntil(a.renewalDate, now) ?? Number.MAX_SAFE_INTEGER;
      const renewalB = daysUntil(b.renewalDate, now) ?? Number.MAX_SAFE_INTEGER;
      if (renewalA !== renewalB) return renewalA - renewalB;

      return a.title.localeCompare(b.title);
    });

    return ranked;
  }
}

function scoreItem(item: TodayPrioritizationInput, now: Date) {
  const confidence = item.confidenceScore * 100;
  const dueDays = daysUntil(item.dueDate, now);
  const renewalDays = daysUntil(item.renewalDate, now);
  const priorityHint = item.priorityHintScore ?? 0;

  let score =
    item.urgencyScore * 0.34 +
    item.importanceScore * 0.24 +
    confidence * 0.12 +
    priorityHint * 0.18;

  if (dueDays !== null) {
    if (dueDays <= 0) score += 34;
    else if (dueDays <= 1) score += 28;
    else if (dueDays <= 3) score += 20;
    else if (dueDays <= 7) score += 12;
  }

  if (renewalDays !== null) {
    if (renewalDays <= 0) score += 24;
    else if (renewalDays <= 2) score += 18;
    else if (renewalDays <= 5) score += 12;
    else if (renewalDays <= 7) score += 8;
  }

  if (item.needsReview) {
    score += 10;
  }

  if (item.amount !== null && item.amount > 0) {
    if (item.amount >= 300) score += 12;
    else if (item.amount >= 100) score += 9;
    else if (item.amount >= 25) score += 6;
    else score += 4;
  }

  if (item.status === ObligationStatus.POSTPONED) {
    score += 6;
  }

  if (item.confidenceBand === "LOW") {
    score -= 10;
  } else if (item.confidenceBand === "MEDIUM") {
    score -= 4;
  }

  const hoursSinceActed = hoursSince(item.lastActedAt, now);
  if (hoursSinceActed !== null) {
    if (hoursSinceActed < 18) score -= 30;
    else if (hoursSinceActed < 36) score -= 16;
  }

  if (!Number.isFinite(score)) {
    return 0;
  }

  return clamp(Math.round(score), 0, 160);
}

function selectActions(
  item: TodayPrioritizationInput,
  priorityBand: TodayPriorityBand
): {
  primaryAction: TodayAction;
  secondaryActions: TodayAction[];
} {
  if (item.itemType === "TRACKED_ANCHOR") {
    return selectTrackedAnchorActions(item);
  }

  const detailsAction: TodayAction = {
    key: "VIEW_DETAILS",
    label: "View details",
    mode: "NAVIGATE",
    href: `/obligations/${item.id}`
  };

  const remindAction: TodayAction = {
    key: "REMIND_LATER",
    label: "Remind later",
    mode: "INLINE"
  };

  if (item.subscriptionId) {
    return {
      primaryAction: {
        key: "REVIEW_SUBSCRIPTION",
        label: "Review",
        mode: "NAVIGATE",
        href: `/subscriptions/review/${item.subscriptionId}`
      },
      secondaryActions: [remindAction, detailsAction]
    };
  }

  if (item.needsReview || item.confidenceBand === "LOW") {
    return {
      primaryAction: {
        key: "REVIEW",
        label: "Review",
        mode: "NAVIGATE",
        href: `/obligations/${item.id}/review`
      },
      secondaryActions: [remindAction, detailsAction]
    };
  }

  const dueSoon = withinDays(item.dueDate, 2) || withinDays(item.renewalDate, 2);

  if (priorityBand === "URGENT" || dueSoon) {
    return {
      primaryAction: {
        key: "MARK_DONE",
        label: "Handle now",
        mode: "INLINE"
      },
      secondaryActions: [
        {
          key: "OPEN_GUIDED",
          label: "Start",
          mode: "GUIDED"
        },
        remindAction
      ]
    };
  }

  const secondaryActions: TodayAction[] = [
    {
      key: "MARK_DONE",
      label: "Mark safe",
      mode: "INLINE"
    },
    remindAction,
    detailsAction
  ];

  return {
    primaryAction: {
      key: "OPEN_GUIDED",
      label: "Start",
      mode: "GUIDED"
    },
    secondaryActions: secondaryActions.slice(0, 2)
  };
}

function buildWhyNow(item: TodayPrioritizationInput, now: Date) {
  if (item.itemType === "TRACKED_ANCHOR") {
    return buildTrackedAnchorWhyNow(item);
  }

  const dueDays = daysUntil(item.dueDate, now);
  if (dueDays !== null && dueDays <= 0) {
    return "This is due now.";
  }
  if (dueDays !== null && dueDays <= 7) {
    if (dueDays === 0) return "This is due today.";
    if (dueDays === 1) return "This is due tomorrow.";
    return `This is due in ${dueDays} days.`;
  }

  const renewalDays = daysUntil(item.renewalDate, now);
  if (renewalDays !== null && renewalDays <= 0) {
    return "This renews today.";
  }
  if (renewalDays !== null && renewalDays <= 7) {
    if (renewalDays === 1) return "This renews tomorrow.";
    return `This renews in ${renewalDays} days.`;
  }

  if (item.needsReview) {
    return "A quick review is safer before deciding.";
  }

  if (item.status === ObligationStatus.POSTPONED) {
    return "You postponed this earlier, so it is back on deck.";
  }

  return "Worth handling now to keep things clear.";
}

function buildWhyThisMatters(item: TodayPrioritizationInput) {
  if (item.itemType === "TRACKED_ANCHOR") {
    return buildTrackedAnchorWhyThisMatters(item);
  }

  if (item.amount !== null && item.amount > 0) {
    return "Handling this now helps avoid surprise costs.";
  }

  if (item.subscriptionId || item.type === "SUBSCRIPTION" || item.type === "RENEWAL") {
    return "A quick decision here can prevent repeat charges.";
  }

  if (item.scopeType === ScopeType.HOUSEHOLD && item.assignee?.name) {
    return `Getting this handled keeps everyone on the same page with ${item.assignee.name}.`;
  }

  return "Handling this now keeps today lighter.";
}

function toPriorityBand(score: number): TodayPriorityBand {
  if (score >= 92) return "URGENT";
  if (score >= 72) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

function daysUntil(value: string | null, now: Date) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function hoursSince(value: string | null, now: Date) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return (now.getTime() - parsed.getTime()) / (60 * 60 * 1000);
}

function withinDays(value: string | null, days: number) {
  const next = daysUntil(value, new Date());
  return next !== null && next >= 0 && next <= days;
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function selectTrackedAnchorActions(item: TodayPrioritizationInput): {
  primaryAction: TodayAction;
  secondaryActions: TodayAction[];
} {
  const remindLater: TodayAction = {
    key: "REMIND_LATER",
    label: "Remind later",
    mode: "INLINE"
  };

  const category = item.trackedAnchor?.category ?? "OTHER";
  const weakTiming =
    item.trackedAnchor?.dueReason === "INSUFFICIENT_TIMING" ||
    !item.trackedAnchor?.timingKnown;

  if (weakTiming) {
    return {
      primaryAction: {
        key: "REVIEW",
        label: "Review",
        mode: "NAVIGATE",
        href: "/settings#watch-list"
      },
      secondaryActions: [
        remindLater,
        {
          key: "DISMISS",
          label: "Stop watching",
          mode: "INLINE"
        }
      ]
    };
  }

  if (category === "SUBSCRIPTION" || category === "MEMBERSHIP") {
    return {
      primaryAction: {
        key: "MARK_DONE",
        label: "Keep",
        mode: "INLINE"
      },
      secondaryActions: [
        {
          key: "DISMISS",
          label: "Cancel",
          mode: "INLINE"
        },
        remindLater
      ]
    };
  }

  if (category === "BILL" || category === "LOAN" || category === "TAX") {
    return {
      primaryAction: {
        key: "MARK_DONE",
        label: "Pay",
        mode: "INLINE"
      },
      secondaryActions: [remindLater]
    };
  }

  if (category === "INSURANCE") {
    return {
      primaryAction: {
        key: "REVIEW",
        label: "Review",
        mode: "NAVIGATE",
        href: "/settings#watch-list"
      },
      secondaryActions: [
        {
          key: "MARK_DONE",
          label: "Keep",
          mode: "INLINE"
        },
        remindLater
      ]
    };
  }

  return {
    primaryAction: {
      key: "REVIEW",
      label: "Review",
      mode: "NAVIGATE",
      href: "/settings#watch-list"
    },
    secondaryActions: [remindLater]
  };
}

function buildTrackedAnchorWhyNow(item: TodayPrioritizationInput) {
  const label = item.title;
  const category = item.trackedAnchor?.category ?? "OTHER";
  const dueReason = item.trackedAnchor?.dueReason ?? "INSUFFICIENT_TIMING";

  if (dueReason === "INSUFFICIENT_TIMING") {
    return "This may be coming up soon. Worth a quick check?";
  }

  if (category === "SUBSCRIPTION" || category === "MEMBERSHIP") {
    return `${label} is likely coming up soon. Still using it?`;
  }

  if (category === "BILL" || category === "LOAN" || category === "TAX") {
    return `${label} is probably due around now. Want to take care of it?`;
  }

  if (category === "INSURANCE") {
    return `${label} is coming up soon. Worth a quick review?`;
  }

  return `${label} may be coming up soon. Worth a quick check?`;
}

function buildTrackedAnchorWhyThisMatters(item: TodayPrioritizationInput) {
  if (item.trackedAnchor?.dueReason === "INSUFFICIENT_TIMING") {
    return "You asked us to keep an eye on this, so we brought it back for a quick check.";
  }

  return "You asked us to keep an eye on this, so we brought it back around the likely timing.";
}
