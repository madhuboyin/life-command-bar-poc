import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference
} from "@prisma/client";
import type { TodayPrioritizedItem } from "./today-prioritization.service";
import {
  UNKNOWN_BEHAVIOR_PROFILE,
  type BehaviorProfileView,
  type PersonalizationAdjustment,
  type PersonalizationDebugMetadata,
  type ReminderScheduleDecision,
  type ReminderSuggestionStyle,
  type TodayPresentationStyle
} from "../types/personalization-policy.types";

const RANKING_BOOST_REVIEW_FIRST = 4;
const RANKING_BOOST_QUICK_ACTION = 4;
const RANKING_BOOST_FAST_ACTION = 3;
const RANKING_BOOST_LOW_DEFER = 1;
const RANKING_PACING_BOOST_SLOW = 1;
const RANKING_PENALTY_HIGH_DEFER_LOW_VALUE = -3;

const URGENCY_GUARDRAIL_POSITIVE_CAP = 2;
const MAX_POSITIVE_RANKING_ADJUSTMENT = 6;
const MAX_NEGATIVE_RANKING_ADJUSTMENT = -4;

const TODAY_REMINDER_DEFAULT_MS = 24 * 60 * 60 * 1000;
const TODAY_REMINDER_SHORT_MS = 16 * 60 * 60 * 1000;
const TODAY_REMINDER_REALISTIC_MS = 72 * 60 * 60 * 1000;

const SUBSCRIPTION_REMINDER_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_REMINDER_SHORT_MS = 3 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_REMINDER_REALISTIC_MS = 10 * 24 * 60 * 60 * 1000;

const MIN_REMINDER_FLOOR_MS = 60 * 60 * 1000;
const URGENT_REMINDER_BUFFER_MS = 6 * 60 * 60 * 1000;

type PolicyFeatureFlags = {
  enableRanking: boolean;
  enableMessaging: boolean;
  enableReminderTuning: boolean;
};

type ServiceDependencies = {
  now?: () => Date;
  flags?: Partial<PolicyFeatureFlags>;
};

export type PersonalizedTodayItem = TodayPrioritizedItem & {
  presentationStyle: TodayPresentationStyle;
  reminderStyle: ReminderSuggestionStyle;
  personalization: PersonalizationDebugMetadata;
};

export type TodayPersonalizationResult = {
  items: PersonalizedTodayItem[];
  personalizationApplied: boolean;
  rankingPersonalizationApplied: boolean;
  messagingPersonalizationApplied: boolean;
  reminderPersonalizationApplied: boolean;
  presentationStyleCounts: Record<TodayPresentationStyle, number>;
  reminderStyleCounts: Record<ReminderSuggestionStyle, number>;
};

export class PersonalizationPolicyService {
  private readonly now: () => Date;
  private readonly flags: PolicyFeatureFlags;

  constructor(dependencies: ServiceDependencies = {}) {
    this.now = dependencies.now ?? (() => new Date());
    this.flags = {
      enableRanking:
        dependencies.flags?.enableRanking ??
        readBooleanEnv("LCB_PERSONALIZATION_TODAY_RANKING_ENABLED", true),
      enableMessaging:
        dependencies.flags?.enableMessaging ??
        readBooleanEnv("LCB_PERSONALIZATION_MESSAGE_STYLE_ENABLED", true),
      enableReminderTuning:
        dependencies.flags?.enableReminderTuning ??
        readBooleanEnv("LCB_PERSONALIZATION_REMINDER_STYLE_ENABLED", true)
    };
  }

  applyTodayViewPersonalization(input: {
    items: TodayPrioritizedItem[];
    profile?: BehaviorProfileView | null;
    now?: Date;
  }): TodayPersonalizationResult {
    const now = input.now ?? this.now();
    const profile = input.profile ?? UNKNOWN_BEHAVIOR_PROFILE;

    const personalized = input.items.map((item, index) => {
      const decision = this.buildTodayDecision({
        item,
        profile,
        now
      });

      return {
        ...item,
        priorityScore: decision.finalPriorityScore,
        presentationStyle: decision.presentationStyle,
        reminderStyle: decision.reminderStyle,
        personalization: decision,
        _index: index
      };
    });

    const rankingPersonalizationApplied = personalized.some(
      (item) => item.personalization.basePriorityScore !== item.personalization.finalPriorityScore
    );
    const messagingPersonalizationApplied = personalized.some(
      (item) => item.presentationStyle !== "DEFAULT"
    );
    const reminderPersonalizationApplied = personalized.some(
      (item) => item.reminderStyle !== "DEFAULT"
    );

    // Stability guardrail:
    // preserve baseline ordering whenever ranking deltas are neutral.
    const ordered = rankingPersonalizationApplied
      ? personalized.sort((a, b) => comparePrioritizedItems(a, b, now))
      : personalized;

    const items = ordered.map(({ _index: _unused, ...item }) => item);
    const presentationStyleCounts = countPresentationStyles(items);
    const reminderStyleCounts = countReminderStyles(items);

    return {
      items,
      personalizationApplied:
        rankingPersonalizationApplied ||
        messagingPersonalizationApplied ||
        reminderPersonalizationApplied,
      rankingPersonalizationApplied,
      messagingPersonalizationApplied,
      reminderPersonalizationApplied,
      presentationStyleCounts,
      reminderStyleCounts
    };
  }

  resolveTodayReminderSchedule(input: {
    profile?: BehaviorProfileView | null;
    dueDate?: string | null;
    renewalDate?: string | null;
    requestedRemindAt?: Date | null;
    now?: Date;
  }): ReminderScheduleDecision {
    const now = input.now ?? this.now();

    if (input.requestedRemindAt) {
      return {
        remindAt: input.requestedRemindAt,
        reminderStyle: this.resolveReminderStyle({
          profile: input.profile ?? UNKNOWN_BEHAVIOR_PROFILE
        }),
        usedPersonalizedDefault: false,
        reason: "USER_PROVIDED"
      };
    }

    const profile = input.profile ?? UNKNOWN_BEHAVIOR_PROFILE;
    const reminderStyle = this.resolveReminderStyle({ profile });
    const baseOffsetMs =
      reminderStyle === "SHORT_FOLLOWUP"
        ? TODAY_REMINDER_SHORT_MS
        : reminderStyle === "REALISTIC_FOLLOWUP"
          ? TODAY_REMINDER_REALISTIC_MS
          : TODAY_REMINDER_DEFAULT_MS;

    const dueAt = earliestDate(input.dueDate, input.renewalDate);
    const remindAt = this.applyUrgencyReminderGuardrail({
      now,
      targetAt: new Date(now.getTime() + baseOffsetMs),
      dueAt
    });

    return {
      remindAt,
      reminderStyle,
      usedPersonalizedDefault: reminderStyle !== "DEFAULT",
      reason: reminderStyle === "DEFAULT" ? "BASELINE_DEFAULT" : "PROFILE_TUNED_DEFAULT"
    };
  }

  resolveSubscriptionReminderSchedule(input: {
    profile?: BehaviorProfileView | null;
    nextRenewalDate?: string | null;
    requestedRemindAt?: Date | null;
    now?: Date;
  }): ReminderScheduleDecision {
    const now = input.now ?? this.now();

    if (input.requestedRemindAt) {
      return {
        remindAt: input.requestedRemindAt,
        reminderStyle: this.resolveReminderStyle({
          profile: input.profile ?? UNKNOWN_BEHAVIOR_PROFILE
        }),
        usedPersonalizedDefault: false,
        reason: "USER_PROVIDED"
      };
    }

    const profile = input.profile ?? UNKNOWN_BEHAVIOR_PROFILE;
    const reminderStyle = this.resolveReminderStyle({ profile });
    const baseOffsetMs =
      reminderStyle === "SHORT_FOLLOWUP"
        ? SUBSCRIPTION_REMINDER_SHORT_MS
        : reminderStyle === "REALISTIC_FOLLOWUP"
          ? SUBSCRIPTION_REMINDER_REALISTIC_MS
          : SUBSCRIPTION_REMINDER_DEFAULT_MS;

    const remindAt = this.applyUrgencyReminderGuardrail({
      now,
      targetAt: new Date(now.getTime() + baseOffsetMs),
      dueAt: parseDate(input.nextRenewalDate)
    });

    return {
      remindAt,
      reminderStyle,
      usedPersonalizedDefault: reminderStyle !== "DEFAULT",
      reason: reminderStyle === "DEFAULT" ? "BASELINE_DEFAULT" : "PROFILE_TUNED_DEFAULT"
    };
  }

  private buildTodayDecision(input: {
    item: TodayPrioritizedItem;
    profile: BehaviorProfileView;
    now: Date;
  }): PersonalizationDebugMetadata {
    const { item, profile, now } = input;
    const adjustments: PersonalizationAdjustment[] = [];
    const isUrgentTruth = isUrgentOrDueSoon(item, now);
    const isReviewable = isReviewItem(item);
    const isDirectAction = isDirectActionItem(item);
    const isLowValueNonUrgent = isLowValueNonUrgentItem(item, now);

    if (this.flags.enableRanking) {
      if (
        profile.reviewPreference === BehaviorReviewPreference.QUICK_ACTION &&
        isDirectAction
      ) {
        adjustments.push({
          source: "reviewPreference",
          effect: "boost_direct_action_item",
          delta: RANKING_BOOST_QUICK_ACTION
        });
      }

      if (
        profile.reviewPreference === BehaviorReviewPreference.REVIEW_FIRST &&
        isReviewable
      ) {
        adjustments.push({
          source: "reviewPreference",
          effect: "boost_reviewable_item",
          delta: RANKING_BOOST_REVIEW_FIRST
        });
      }

      if (profile.actionSpeed === BehaviorActionSpeed.FAST && isDirectAction) {
        adjustments.push({
          source: "actionSpeed",
          effect: "boost_short_decision_path",
          delta: RANKING_BOOST_FAST_ACTION
        });
      }

      if (
        profile.actionSpeed === BehaviorActionSpeed.SLOW &&
        isReviewable &&
        !isUrgentTruth
      ) {
        adjustments.push({
          source: "actionSpeed",
          effect: "support_review_pacing",
          delta: RANKING_PACING_BOOST_SLOW
        });
      }

      if (
        profile.deferFrequency === BehaviorDeferFrequency.HIGH &&
        isLowValueNonUrgent
      ) {
        adjustments.push({
          source: "deferFrequency",
          effect: "reduce_low_value_nonurgent_weight",
          delta: RANKING_PENALTY_HIGH_DEFER_LOW_VALUE
        });
      }

      if (
        profile.deferFrequency === BehaviorDeferFrequency.LOW &&
        isDirectAction &&
        !isUrgentTruth
      ) {
        adjustments.push({
          source: "deferFrequency",
          effect: "boost_ready_now_follow_through",
          delta: RANKING_BOOST_LOW_DEFER
        });
      }
    }

    let rankingAdjustment = adjustments.reduce((total, adjustment) => total + adjustment.delta, 0);

    // Hard guardrail: urgency and deadline truth win over personalization.
    if (isUrgentTruth) {
      if (rankingAdjustment < 0) {
        rankingAdjustment = 0;
      }
      rankingAdjustment = Math.min(rankingAdjustment, URGENCY_GUARDRAIL_POSITIVE_CAP);
    }

    rankingAdjustment = clamp(
      rankingAdjustment,
      MAX_NEGATIVE_RANKING_ADJUSTMENT,
      MAX_POSITIVE_RANKING_ADJUSTMENT
    );

    const presentationStyle = this.resolvePresentationStyle({
      item,
      profile,
      isReviewable,
      isUrgentTruth
    });

    const reminderStyle = this.resolveReminderStyle({
      profile,
      isUrgentTruth
    });

    const basePriorityScore = item.priorityScore;
    const finalPriorityScore = clamp(basePriorityScore + rankingAdjustment, 0, 160);

    return {
      basePriorityScore,
      finalPriorityScore,
      personalizationApplied:
        rankingAdjustment !== 0 ||
        presentationStyle !== "DEFAULT" ||
        reminderStyle !== "DEFAULT",
      presentationStyle,
      reminderStyle,
      adjustments
    };
  }

  private resolvePresentationStyle(input: {
    item: TodayPrioritizedItem;
    profile: BehaviorProfileView;
    isReviewable: boolean;
    isUrgentTruth: boolean;
  }): TodayPresentationStyle {
    if (!this.flags.enableMessaging) return "DEFAULT";

    const { profile, isReviewable, isUrgentTruth, item } = input;
    if (isUrgentTruth || item.priorityBand === "URGENT") {
      return "DEFAULT";
    }

    if (
      profile.reviewPreference === BehaviorReviewPreference.REVIEW_FIRST ||
      (profile.actionSpeed === BehaviorActionSpeed.SLOW && isReviewable)
    ) {
      return "SUPPORTED_REVIEW";
    }

    if (
      profile.reviewPreference === BehaviorReviewPreference.QUICK_ACTION &&
      !isReviewable
    ) {
      return "COMPACT_ACTION";
    }

    if (
      profile.actionSpeed === BehaviorActionSpeed.FAST &&
      !isReviewable
    ) {
      return "COMPACT_ACTION";
    }

    return "DEFAULT";
  }

  private resolveReminderStyle(input: {
    profile: BehaviorProfileView;
    isUrgentTruth?: boolean;
  }): ReminderSuggestionStyle {
    if (!this.flags.enableReminderTuning) return "DEFAULT";

    if (input.isUrgentTruth) {
      return "DEFAULT";
    }

    if (
      input.profile.deferFrequency === BehaviorDeferFrequency.HIGH ||
      input.profile.actionSpeed === BehaviorActionSpeed.SLOW
    ) {
      return "REALISTIC_FOLLOWUP";
    }

    if (input.profile.actionSpeed === BehaviorActionSpeed.FAST) {
      return "SHORT_FOLLOWUP";
    }

    return "DEFAULT";
  }

  private applyUrgencyReminderGuardrail(input: {
    now: Date;
    targetAt: Date;
    dueAt: Date | null;
  }) {
    const { now, targetAt, dueAt } = input;
    const floorAt = new Date(now.getTime() + MIN_REMINDER_FLOOR_MS);

    if (!dueAt) {
      return maxDate(targetAt, floorAt);
    }

    const msUntilDue = dueAt.getTime() - now.getTime();
    if (msUntilDue <= MIN_REMINDER_FLOOR_MS) {
      return new Date(now.getTime() + URGENT_REMINDER_BUFFER_MS);
    }

    const latestSafeReminder = new Date(
      dueAt.getTime() - URGENT_REMINDER_BUFFER_MS
    );

    if (latestSafeReminder.getTime() <= floorAt.getTime()) {
      return floorAt;
    }

    return maxDate(minDate(targetAt, latestSafeReminder), floorAt);
  }
}

function comparePrioritizedItems(
  left: PersonalizedTodayItem & { _index: number },
  right: PersonalizedTodayItem & { _index: number },
  now: Date
) {
  const scoreDelta =
    right.personalization.finalPriorityScore -
    left.personalization.finalPriorityScore;
  if (scoreDelta !== 0) return scoreDelta;

  const dueLeft = daysUntil(left.dueDate, now) ?? Number.MAX_SAFE_INTEGER;
  const dueRight = daysUntil(right.dueDate, now) ?? Number.MAX_SAFE_INTEGER;
  if (dueLeft !== dueRight) return dueLeft - dueRight;

  const renewalLeft =
    daysUntil(left.renewalDate, now) ?? Number.MAX_SAFE_INTEGER;
  const renewalRight =
    daysUntil(right.renewalDate, now) ?? Number.MAX_SAFE_INTEGER;
  if (renewalLeft !== renewalRight) return renewalLeft - renewalRight;

  const titleDelta = left.title.localeCompare(right.title);
  if (titleDelta !== 0) return titleDelta;
  return left._index - right._index;
}

function isReviewItem(item: TodayPrioritizedItem) {
  return (
    item.primaryAction.key === "REVIEW" ||
    item.primaryAction.key === "REVIEW_SUBSCRIPTION" ||
    item.needsReview ||
    item.confidenceBand === "LOW"
  );
}

function isDirectActionItem(item: TodayPrioritizedItem) {
  return (
    item.primaryAction.key === "MARK_DONE" ||
    item.primaryAction.key === "OPEN_GUIDED" ||
    item.primaryAction.key === "VIEW_DETAILS"
  );
}

function isLowValueNonUrgentItem(item: TodayPrioritizedItem, now: Date) {
  if (isUrgentOrDueSoon(item, now)) return false;

  const hasMeaningfulAmount = item.amount !== null && item.amount >= 60;
  const hasReviewSignals = item.needsReview || item.confidenceBand !== "HIGH";
  const highPriorityBand = item.priorityBand === "HIGH" || item.priorityBand === "URGENT";

  return !hasMeaningfulAmount && !hasReviewSignals && !highPriorityBand;
}

function isUrgentOrDueSoon(item: TodayPrioritizedItem, now: Date) {
  if (item.priorityBand === "URGENT") return true;
  const dueDays = daysUntil(item.dueDate, now);
  const renewalDays = daysUntil(item.renewalDate, now);

  return (
    (dueDays !== null && dueDays <= 2) ||
    (renewalDays !== null && renewalDays <= 2)
  );
}

function countPresentationStyles(items: PersonalizedTodayItem[]) {
  return {
    DEFAULT: items.filter((item) => item.presentationStyle === "DEFAULT").length,
    COMPACT_ACTION: items.filter((item) => item.presentationStyle === "COMPACT_ACTION").length,
    SUPPORTED_REVIEW: items.filter((item) => item.presentationStyle === "SUPPORTED_REVIEW").length
  } satisfies Record<TodayPresentationStyle, number>;
}

function countReminderStyles(items: PersonalizedTodayItem[]) {
  return {
    DEFAULT: items.filter((item) => item.reminderStyle === "DEFAULT").length,
    SHORT_FOLLOWUP: items.filter((item) => item.reminderStyle === "SHORT_FOLLOWUP").length,
    REALISTIC_FOLLOWUP: items.filter((item) => item.reminderStyle === "REALISTIC_FOLLOWUP").length
  } satisfies Record<ReminderSuggestionStyle, number>;
}

function earliestDate(...values: Array<string | null | undefined>) {
  const parsed = values.map((value) => parseDate(value)).filter((value): value is Date => value !== null);
  if (parsed.length === 0) return null;

  parsed.sort((a, b) => a.getTime() - b.getTime());
  return parsed[0] ?? null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function daysUntil(value: string | null, now: Date) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor((parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function minDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

function maxDate(left: Date, right: Date) {
  return left.getTime() >= right.getTime() ? left : right;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return fallback;
}
