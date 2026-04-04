import {
  SubscriptionRecommendationType,
  type SubscriptionLifecycleState
} from "@prisma/client";
import type {
  SubscriptionInsightCandidate,
  SubscriptionRecommendationRecord
} from "./subscription-insight-types";

export class SubscriptionRecommendationService {
  recommend(input: {
    subscriptionId: string;
    lifecycleState: SubscriptionLifecycleState;
    confidenceScore: number;
    nextRenewalDate: Date | null;
    insights: SubscriptionInsightCandidate[];
    now?: Date;
  }): SubscriptionRecommendationRecord {
    const now = input.now ?? new Date();
    const insightTypes = new Set(input.insights.map((item) => item.insightType));
    const hasInsight = (value: string) => insightTypes.has(value as any);
    const daysToRenewal = daysUntil(input.nextRenewalDate, now);

    if (hasInsight("CANCELLATION_CONFIRMED")) {
      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: SubscriptionRecommendationType.CONFIRM,
        confidence: 0.9,
        reason: "Cancellation signal is strong. Confirm and close remaining renewal prompts.",
        supportingInsights: input.insights
      });
    }

    if (hasInsight("PRICE_INCREASE") && hasInsight("RENEWAL_UPCOMING")) {
      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: SubscriptionRecommendationType.REVIEW,
        confidence: 0.88,
        reason: "Price increased and renewal is near. Review before the next charge.",
        supportingInsights: input.insights
      });
    }

    if (hasInsight("DUPLICATE_SUBSCRIPTION")) {
      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: SubscriptionRecommendationType.REVIEW,
        confidence: 0.82,
        reason: "Duplicate subscription signals were detected. Review to merge or separate correctly.",
        supportingInsights: input.insights
      });
    }

    if (hasInsight("UNKNOWN_STATE") || hasInsight("PLAN_MISMATCH")) {
      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: SubscriptionRecommendationType.REVIEW,
        confidence: 0.74,
        reason: "Lifecycle or plan signals conflict. Review to keep the subscription record accurate.",
        supportingInsights: input.insights
      });
    }

    if (hasInsight("UNUSED_RISK")) {
      if (daysToRenewal !== null && daysToRenewal <= 14) {
        return buildRecommendation({
          subscriptionId: input.subscriptionId,
          recommendationType: SubscriptionRecommendationType.CANCEL,
          confidence: 0.72,
          reason: "Subscription appears underused and renewal is close. Consider canceling before the next cycle.",
          supportingInsights: input.insights
        });
      }

      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: SubscriptionRecommendationType.DOWNGRADE,
        confidence: 0.66,
        reason: "Subscription appears underused. Consider downgrading or revisiting value.",
        supportingInsights: input.insights
      });
    }

    if (hasInsight("LOW_CONFIDENCE")) {
      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: SubscriptionRecommendationType.REVIEW,
        confidence: 0.62,
        reason: "Signals are still weak. Confirm details so future decisions stay accurate.",
        supportingInsights: input.insights
      });
    }

    if (hasInsight("RENEWAL_UPCOMING")) {
      const confident = input.confidenceScore >= 0.75;
      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: confident ? SubscriptionRecommendationType.KEEP : SubscriptionRecommendationType.REVIEW,
        confidence: confident ? 0.78 : 0.64,
        reason: confident
          ? "Renewal is upcoming and signals are stable. Keep unless your usage changed."
          : "Renewal is upcoming but confidence is moderate. Quick review is recommended.",
        supportingInsights: input.insights
      });
    }

    if (
      input.lifecycleState === "CANCELED" ||
      input.lifecycleState === "ENDED" ||
      input.lifecycleState === "INACTIVE"
    ) {
      return buildRecommendation({
        subscriptionId: input.subscriptionId,
        recommendationType: SubscriptionRecommendationType.IGNORE,
        confidence: 0.8,
        reason: "Subscription is no longer active. No immediate action is needed.",
        supportingInsights: input.insights
      });
    }

    return buildRecommendation({
      subscriptionId: input.subscriptionId,
      recommendationType: SubscriptionRecommendationType.KEEP,
      confidence: 0.58,
      reason: "No high-risk signals detected. Keep monitoring lifecycle updates.",
      supportingInsights: input.insights
    });
  }
}

function buildRecommendation(input: {
  subscriptionId: string;
  recommendationType: SubscriptionRecommendationType;
  reason: string;
  confidence: number;
  supportingInsights: SubscriptionInsightCandidate[];
}): SubscriptionRecommendationRecord {
  return {
    subscriptionId: input.subscriptionId,
    recommendationType: input.recommendationType,
    reason: input.reason,
    confidence: clamp(input.confidence, 0, 1),
    supportingInsights: Array.from(new Set(input.supportingInsights.map((item) => item.insightType)))
  };
}

function daysUntil(value: Date | null, now: Date) {
  if (!value) return null;
  const diff = value.getTime() - now.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

