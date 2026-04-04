import {
  EffortLevel,
  ImpactLevel,
  ObligationType,
  OutcomeSourceContext,
  OutcomeType
} from "@prisma/client";
import { PersonalizationRepository } from "../repositories/personalization.repository";
import type {
  PersonalizationDebug,
  PersonalizationInfluence,
  PersonalizationSignals,
  PersonalizationSummary
} from "../types/personalization.types";
import type { GuidedJourneyTemplate } from "../types/guided-journey.types";

type SignalWindowData = Awaited<
  ReturnType<PersonalizationRepository["getSignalWindowData"]>
>;

type RankedItemContext = {
  obligationType: ObligationType;
  isUrgent: boolean;
  isQuickWin: boolean;
  isMoney: boolean;
  importanceScore: number;
  urgencyScore: number;
};

type GuidedTemplateContext = {
  urgencyScore: number;
  effortLevel: EffortLevel;
};

const LOOKBACK_DAYS = 30;
const DUE_SOON_HOURS = 48;

export class PersonalizationService {
  private readonly repository = new PersonalizationRepository();

  async getSummary(userId: string): Promise<PersonalizationSummary> {
    const debug = await this.computeDebug(userId);
    return {
      signals: debug.signals,
      lastUpdatedAt: debug.lastUpdatedAt
    };
  }

  async getDebug(userId: string): Promise<PersonalizationDebug> {
    return this.computeDebug(userId);
  }

  async getSignals(userId: string): Promise<PersonalizationSignals> {
    const summary = await this.getSummary(userId);
    return summary.signals;
  }

  getTodayFeedScoreAdjustment(signals: PersonalizationSignals, input: RankedItemContext) {
    let delta = 0;
    const reasons: string[] = [];

    if (input.isUrgent) {
      if (signals.urgencyResponsiveness === "low") {
        delta += 10;
        reasons.push("reinforce urgent items because urgent responses were recently delayed");
      } else if (signals.urgencyResponsiveness === "high") {
        delta += 4;
      }
    }

    if (input.isQuickWin) {
      if (signals.quickWinAffinity === "high") {
        delta += 8;
        reasons.push("boost quick wins based on recent completion pattern");
      } else if (signals.quickWinAffinity === "low") {
        delta -= 4;
      }
    }

    if (input.isMoney) {
      if (signals.moneySensitivity === "low") {
        delta += 7;
        reasons.push("elevate money-risk items due to repeated money-item deferrals");
      } else if (signals.moneySensitivity === "act_now") {
        delta += 3;
      }
    }

    if (
      input.obligationType === ObligationType.SUBSCRIPTION &&
      signals.subscriptionPreferenceBias === "cancel_leaning" &&
      !input.isUrgent &&
      input.importanceScore < 60
    ) {
      delta -= 4;
      reasons.push("soften low-importance subscription nags due to cancel preference");
    }

    if (
      input.obligationType === ObligationType.COMMITMENT &&
      signals.postponementPattern === "commitments_often_postponed"
    ) {
      delta += input.isUrgent ? 6 : 2;
      reasons.push("surface commitments to reduce repeat postpone loops");
    }

    return {
      delta,
      reasons
    };
  }

  getDailyPulseScoreAdjustment(signals: PersonalizationSignals, input: RankedItemContext) {
    let delta = 0;
    const reasons: string[] = [];

    if (input.isUrgent && signals.urgencyResponsiveness === "low") {
      delta += 9;
      reasons.push("urgent reinforcement");
    }

    if (input.isQuickWin) {
      if (signals.quickWinAffinity === "high") {
        delta += 7;
        reasons.push("quick-win affinity boost");
      } else if (signals.quickWinAffinity === "low") {
        delta -= 3;
      }
    }

    if (input.isMoney && signals.moneySensitivity === "low") {
      delta += 6;
      reasons.push("money-risk emphasis");
    }

    if (
      input.obligationType === ObligationType.COMMITMENT &&
      signals.postponementPattern === "commitments_often_postponed"
    ) {
      delta += 4;
      reasons.push("commitment loop interruption");
    }

    return {
      delta,
      reasons
    };
  }

  personalizeGuidedTemplate(
    template: GuidedJourneyTemplate,
    signals: PersonalizationSignals,
    context: GuidedTemplateContext
  ) {
    const nextTemplate: GuidedJourneyTemplate = {
      ...template,
      steps: template.steps.map((step) => ({ ...step })),
      recommendedPath: template.recommendedPath
    };

    const adjustments: string[] = [];

    if (nextTemplate.journeyType === "SUBSCRIPTION") {
      if (signals.subscriptionPreferenceBias === "cancel_leaning") {
        setRecommendedOption(nextTemplate, "choose_decision", "cancel");
        nextTemplate.recommendedPath =
          "You often decide to cancel low-value subscriptions. Verify usage, then cancel intentionally if still low-value.";
        adjustments.push("subscription_default_cancel");
      } else if (signals.subscriptionPreferenceBias === "keep_leaning") {
        setRecommendedOption(nextTemplate, "choose_decision", "keep");
        adjustments.push("subscription_default_keep");
      } else if (signals.subscriptionPreferenceBias === "review_first") {
        setRecommendedOption(nextTemplate, "verify_usage", "rarely_use");
        setRecommendedOption(nextTemplate, "finalize", "set_reminder");
        adjustments.push("subscription_review_first");
      }
    }

    if (nextTemplate.journeyType === "BILL") {
      if (signals.moneySensitivity === "review_first") {
        setRecommendedOption(nextTemplate, "choose_handling_path", "review");
        adjustments.push("bill_review_first");
      }

      if (signals.moneySensitivity === "act_now" && context.urgencyScore >= 70) {
        setRecommendedOption(nextTemplate, "choose_handling_path", "pay");
        setRecommendedOption(nextTemplate, "prepare_execution", "do_now");
        adjustments.push("bill_pay_now_on_urgency");
      }
    }

    if (nextTemplate.journeyType === "COMMITMENT") {
      if (signals.postponementPattern === "commitments_often_postponed") {
        const nextOption = context.effortLevel === "LOW" ? "do_now" : "postpone";
        setRecommendedOption(nextTemplate, "choose_direction", nextOption);
        adjustments.push("commitment_postpone_pattern");
      }

      if (signals.journeyCompletionStyle === "often_abandons") {
        setRecommendedOption(nextTemplate, "finalize", "complete_journey");
        nextTemplate.recommendedPath =
          "Keep this journey short and complete one concrete action before leaving.";
        adjustments.push("commitment_completion_support");
      }
    }

    if (
      nextTemplate.journeyType === "RENEWAL" &&
      signals.urgencyResponsiveness === "low" &&
      context.urgencyScore >= 75
    ) {
      setRecommendedOption(nextTemplate, "finalize", "do_now");
      adjustments.push("renewal_urgent_do_now");
    }

    return {
      template: nextTemplate,
      adjustments
    };
  }

  getGuidanceToneHint(signals: PersonalizationSignals, obligationType: ObligationType) {
    if (
      obligationType === ObligationType.BILL &&
      signals.moneySensitivity === "review_first"
    ) {
      return "You usually review bill details before acting, so this recommendation starts with a quick review.";
    }

    if (
      obligationType === ObligationType.COMMITMENT &&
      signals.postponementPattern === "commitments_often_postponed"
    ) {
      return "You have postponed similar commitments recently, so this guidance favors one concrete next step.";
    }

    if (
      obligationType === ObligationType.SUBSCRIPTION &&
      signals.subscriptionPreferenceBias === "cancel_leaning"
    ) {
      return "You often trim low-value subscriptions, so this recommendation leans toward intentional cancellation review.";
    }

    return null;
  }

  private async computeDebug(userId: string): Promise<PersonalizationDebug> {
    const windowStart = subtractDays(new Date(), LOOKBACK_DAYS);
    const data = await this.repository.getSignalWindowData(userId, windowStart);

    const influences: PersonalizationInfluence[] = [];

    const subscriptionPreferenceBias = computeSubscriptionPreferenceBias(data, influences);
    const postponementPattern = computePostponementPattern(data, influences);
    const quickWinAffinity = computeQuickWinAffinity(data, influences);
    const urgencyResponsiveness = computeUrgencyResponsiveness(data, influences);
    const moneySensitivity = computeMoneySensitivity(data, influences);
    const journeyCompletionStyle = computeJourneyCompletionStyle(data, influences);
    const reminderReliance = computeReminderReliance(data, influences);

    const signals: PersonalizationSignals = {
      subscriptionPreferenceBias,
      postponementPattern,
      quickWinAffinity,
      urgencyResponsiveness,
      moneySensitivity,
      journeyCompletionStyle,
      reminderReliance
    };

    return {
      signals,
      lastUpdatedAt: getLastUpdatedAt(data),
      influences
    };
  }
}

function setRecommendedOption(
  template: GuidedJourneyTemplate,
  stepKey: string,
  optionKey: string
) {
  const step = template.steps.find((item) => item.key === stepKey);
  if (!step) return;
  step.recommendedOption = optionKey;
}

/**
 * Subscription preference bias formula:
 * - Use explicit subscription outcomes (cancel/keep/review actions).
 * - Require at least 3 data points before switching from balanced.
 */
function computeSubscriptionPreferenceBias(
  data: SignalWindowData,
  influences: PersonalizationInfluence[]
): PersonalizationSignals["subscriptionPreferenceBias"] {
  let cancelCount = 0;
  let keepCount = 0;
  let reviewCount = 0;

  for (const item of data.outcomeFeedback) {
    if (item.obligation?.type !== ObligationType.SUBSCRIPTION) continue;

    const action = item.selectedActionKey.toLowerCase();
    if (action.includes("cancel") || item.outcomeType === OutcomeType.DISMISSED_NOT_RELEVANT) {
      cancelCount += 1;
      continue;
    }

    if (action.includes("keep") || action.includes("renew")) {
      keepCount += 1;
      continue;
    }

    if (action.includes("review")) {
      reviewCount += 1;
    }
  }

  const total = cancelCount + keepCount + reviewCount;
  let value: PersonalizationSignals["subscriptionPreferenceBias"] = "balanced";

  if (total >= 3) {
    if (cancelCount / total >= 0.5 && cancelCount >= keepCount + 1) {
      value = "cancel_leaning";
    } else if (keepCount / total >= 0.5 && keepCount >= cancelCount + 1) {
      value = "keep_leaning";
    } else if (reviewCount >= Math.max(cancelCount, keepCount)) {
      value = "review_first";
    }
  }

  influences.push({
    signal: "subscriptionPreferenceBias",
    reason: "Derived from recent subscription decision actions.",
    metrics: {
      cancelCount,
      keepCount,
      reviewCount,
      sampleSize: total,
      value
    }
  });

  return value;
}

/**
 * Postponement pattern formula:
 * - Count postpone actions from explicit outcomes and audit events.
 * - Identify dominant postponed category only when it is at least 50% of postponements.
 */
function computePostponementPattern(
  data: SignalWindowData,
  influences: PersonalizationInfluence[]
): PersonalizationSignals["postponementPattern"] {
  const typeCounts = new Map<ObligationType, number>();
  let total = 0;
  let lowImportanceCount = 0;

  for (const item of data.outcomeFeedback) {
    if (item.outcomeType !== OutcomeType.POSTPONED_INTENTIONALLY) continue;
    const type = item.obligation?.type;
    if (!type) continue;

    total += 1;
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    if (Number(item.obligation?.importanceScore ?? 0) < 50) {
      lowImportanceCount += 1;
    }
  }

  for (const item of data.auditEvents) {
    if (item.eventType !== "obligation_postponed") continue;
    const type = item.obligation?.type;
    if (!type) continue;

    total += 1;
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
    if (Number(item.obligation?.importanceScore ?? 0) < 50) {
      lowImportanceCount += 1;
    }
  }

  let value: PersonalizationSignals["postponementPattern"] = "none";
  const topType = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  if (total >= 3 && topType) {
    const topRatio = topType[1] / total;
    if (topRatio >= 0.5 && topType[0] === ObligationType.COMMITMENT) {
      value = "commitments_often_postponed";
    } else if (topRatio >= 0.5 && topType[0] === ObligationType.RENEWAL) {
      value = "renewals_often_postponed";
    } else if (lowImportanceCount / total >= 0.6) {
      value = "low_importance_postponed";
    } else {
      value = "mixed";
    }
  }

  influences.push({
    signal: "postponementPattern",
    reason: "Derived from postponement behavior by obligation type and importance.",
    metrics: {
      totalPostponed: total,
      topType: topType?.[0] ?? "none",
      topTypeCount: topType?.[1] ?? 0,
      lowImportanceCount,
      value
    }
  });

  return value;
}

/**
 * Quick-win affinity formula:
 * - Evaluate low-effort, meaningful items.
 * - Classify based on completion ratio after at least 4 interactions.
 */
function computeQuickWinAffinity(
  data: SignalWindowData,
  influences: PersonalizationInfluence[]
): PersonalizationSignals["quickWinAffinity"] {
  let completed = 0;
  let deferred = 0;

  for (const item of data.outcomeFeedback) {
    if (!item.obligation) continue;
    if (item.obligation.effortLevel !== EffortLevel.LOW) continue;
    if (Number(item.obligation.importanceScore) < 50) continue;
    if (item.obligation.impactLevel === ImpactLevel.LOW) continue;

    if (
      item.outcomeType === OutcomeType.COMPLETED_SUCCESSFULLY ||
      item.outcomeType === OutcomeType.FOLLOWED_RECOMMENDATION
    ) {
      completed += 1;
      continue;
    }

    if (
      item.outcomeType === OutcomeType.POSTPONED_INTENTIONALLY ||
      item.outcomeType === OutcomeType.DISMISSED_NOT_RELEVANT
    ) {
      deferred += 1;
    }
  }

  const total = completed + deferred;
  let value: PersonalizationSignals["quickWinAffinity"] = "medium";

  if (total >= 4) {
    const completionRatio = completed / total;
    if (completionRatio >= 0.65) {
      value = "high";
    } else if (completionRatio <= 0.35) {
      value = "low";
    }
  }

  influences.push({
    signal: "quickWinAffinity",
    reason: "Derived from completion ratio on low-effort, meaningful items.",
    metrics: {
      completed,
      deferred,
      sampleSize: total,
      value
    }
  });

  return value;
}

/**
 * Urgency responsiveness formula:
 * - Track outcomes for urgent items (high urgency score or near due date).
 * - Prioritize stability by requiring at least 4 urgent interactions.
 */
function computeUrgencyResponsiveness(
  data: SignalWindowData,
  influences: PersonalizationInfluence[]
): PersonalizationSignals["urgencyResponsiveness"] {
  let handled = 0;
  let deferred = 0;

  for (const item of data.outcomeFeedback) {
    if (!item.obligation) continue;

    const isUrgent =
      Number(item.obligation.urgencyScore) >= 85 ||
      isDueWithinHours(item.obligation.dueDate, DUE_SOON_HOURS);

    if (!isUrgent) continue;

    if (
      item.outcomeType === OutcomeType.COMPLETED_SUCCESSFULLY ||
      item.outcomeType === OutcomeType.FOLLOWED_RECOMMENDATION
    ) {
      handled += 1;
      continue;
    }

    if (
      item.outcomeType === OutcomeType.POSTPONED_INTENTIONALLY ||
      item.outcomeType === OutcomeType.DISMISSED_NOT_RELEVANT ||
      item.outcomeType === OutcomeType.ABANDONED
    ) {
      deferred += 1;
    }
  }

  const total = handled + deferred;
  let value: PersonalizationSignals["urgencyResponsiveness"] = "medium";

  if (total >= 4) {
    const handledRatio = handled / total;
    if (handledRatio >= 0.7) {
      value = "high";
    } else if (handledRatio <= 0.3) {
      value = "low";
    }
  }

  influences.push({
    signal: "urgencyResponsiveness",
    reason: "Derived from outcomes on urgent or due-soon items.",
    metrics: {
      handled,
      deferred,
      sampleSize: total,
      value
    }
  });

  return value;
}

/**
 * Money sensitivity formula:
 * - Evaluate behavior on obligations with known amounts.
 * - Distinguish act-now vs review-first vs low sensitivity from action mix.
 */
function computeMoneySensitivity(
  data: SignalWindowData,
  influences: PersonalizationInfluence[]
): PersonalizationSignals["moneySensitivity"] {
  let acted = 0;
  let reviewed = 0;
  let ignored = 0;

  for (const item of data.outcomeFeedback) {
    const amount = item.obligation?.amount;
    if (amount === null || amount === undefined || Number(amount) <= 0) continue;

    const action = item.selectedActionKey.toLowerCase();

    if (
      action.includes("review") ||
      action.includes("check")
    ) {
      reviewed += 1;
    }

    if (
      action.includes("pay") ||
      action.includes("do_now") ||
      action.includes("mark_done") ||
      action.includes("complete") ||
      item.outcomeType === OutcomeType.COMPLETED_SUCCESSFULLY
    ) {
      acted += 1;
    }

    if (
      item.outcomeType === OutcomeType.DISMISSED_NOT_RELEVANT ||
      action.includes("dismiss") ||
      action.includes("ignore")
    ) {
      ignored += 1;
    }
  }

  const total = acted + reviewed + ignored;
  let value: PersonalizationSignals["moneySensitivity"] = "review_first";

  if (total >= 3) {
    if (reviewed >= acted && reviewed >= ignored) {
      value = "review_first";
    } else if (acted > ignored) {
      value = "act_now";
    } else {
      value = "low";
    }
  }

  influences.push({
    signal: "moneySensitivity",
    reason: "Derived from actions on money-related obligations.",
    metrics: {
      acted,
      reviewed,
      ignored,
      sampleSize: total,
      value
    }
  });

  return value;
}

/**
 * Journey completion style formula:
 * - Compare completed journeys to abandoned/dismissed journeys.
 * - Use alternative-option selections to detect non-default decision style.
 */
function computeJourneyCompletionStyle(
  data: SignalWindowData,
  influences: PersonalizationInfluence[]
): PersonalizationSignals["journeyCompletionStyle"] {
  const completed = data.guidedJourneys.filter((item) => item.status === "COMPLETED").length;
  const abandoned = data.guidedJourneys.filter(
    (item) => item.status === "ABANDONED" || item.status === "DISMISSED"
  ).length;

  const alternatives = data.outcomeFeedback.filter(
    (item) =>
      item.sourceContext === OutcomeSourceContext.GUIDED_MODE &&
      item.outcomeType === OutcomeType.CHOSE_DIFFERENT_OPTION
  ).length;

  const total = completed + abandoned;
  let value: PersonalizationSignals["journeyCompletionStyle"] = "mixed";

  if (total >= 3 && completed / total >= 0.65) {
    value = "usually_completes";
  } else if (total >= 3 && abandoned / total >= 0.5) {
    value = "often_abandons";
  } else if (alternatives >= 3) {
    value = "alternative_leaning";
  }

  influences.push({
    signal: "journeyCompletionStyle",
    reason: "Derived from guided journey completion and option-choice behavior.",
    metrics: {
      completed,
      abandoned,
      alternatives,
      sampleSize: total,
      value
    }
  });

  return value;
}

/**
 * Reminder reliance formula:
 * - Combine reminder-setting style actions and reminder creation volume.
 * - Indicates whether user relies on scheduling as a follow-through strategy.
 */
function computeReminderReliance(
  data: SignalWindowData,
  influences: PersonalizationInfluence[]
): PersonalizationSignals["reminderReliance"] {
  let reminderActionCount = 0;

  for (const item of data.outcomeFeedback) {
    const action = item.selectedActionKey.toLowerCase();
    if (
      action.includes("reminder") ||
      action.includes("continue_later") ||
      action.includes("postpone")
    ) {
      reminderActionCount += 1;
    }
  }

  const reminderEventCount = data.reminders.length;
  const total = reminderActionCount + reminderEventCount;

  let value: PersonalizationSignals["reminderReliance"] = "low";
  if (total >= 8) {
    value = "high";
  } else if (total >= 3) {
    value = "medium";
  }

  influences.push({
    signal: "reminderReliance",
    reason: "Derived from reminder actions and reminder creation frequency.",
    metrics: {
      reminderActionCount,
      reminderEventCount,
      total,
      value
    }
  });

  return value;
}

function getLastUpdatedAt(data: SignalWindowData) {
  const timestamps: number[] = [];

  for (const item of data.outcomeFeedback) timestamps.push(item.createdAt.getTime());
  for (const item of data.auditEvents) timestamps.push(item.createdAt.getTime());
  for (const item of data.feedbackEvents) timestamps.push(item.createdAt.getTime());
  for (const item of data.guidedJourneys) timestamps.push(item.updatedAt.getTime());
  for (const item of data.guidedJourneyEvents) timestamps.push(item.createdAt.getTime());
  for (const item of data.resolutionRuns) timestamps.push(item.createdAt.getTime());
  for (const item of data.reminders) timestamps.push(item.createdAt.getTime());

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function isDueWithinHours(value: Date | null | undefined, hours: number) {
  if (!value) return false;
  const now = Date.now();
  return value.getTime() <= now + hours * 60 * 60 * 1000;
}

function subtractDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
}
