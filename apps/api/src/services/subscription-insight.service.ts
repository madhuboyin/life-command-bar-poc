import {
  Prisma,
  ScopeType,
  SubscriptionInsightSeverity,
  SubscriptionInsightType,
  SubscriptionLifecycleState
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";
import {
  SubscriptionRecommendationService
} from "./subscription-recommendation.service";
import type {
  SubscriptionHealth,
  SubscriptionInsightCandidate,
  SubscriptionInsightRecord,
  SubscriptionOptimizationRecord,
  SubscriptionRecommendationRecord
} from "./subscription-insight-types";

const RENEWAL_WINDOW_DAYS = 7;
const UNUSED_MONTHLY_DAYS = 60;
const UNUSED_YEARLY_DAYS = 420;
const PRICE_INCREASE_THRESHOLD = 0.05;

const ACTIVE_LIFECYCLE_STATES = new Set([
  "DISCOVERED",
  "TRIALING",
  "ACTIVE",
  "RENEWING",
  "PRICE_CHANGED",
  "CANCELING"
]);

type SubscriptionWithSignals = Prisma.SubscriptionRegistryGetPayload<{
  include: {
    insights: true;
    recommendation: true;
    priceHistory: {
      orderBy: [{ createdAt: "desc" }];
      take: 24;
    };
    lifecycleEvents: {
      orderBy: [{ createdAt: "desc" }];
      take: 16;
    };
    evidence: {
      orderBy: [{ observedAt: "desc" }];
      take: 24;
    };
    obligations: {
      select: {
        id: true;
        status: true;
        updatedAt: true;
      };
      take: 20;
    };
  };
}>;

type RefreshOptions = {
  emitEvents?: boolean;
  now?: Date;
};

export type SubscriptionActionItem = {
  subscriptionId: string;
  subscriptionTitle: string;
  vendorName: string;
  planName: string | null;
  lifecycleState: SubscriptionLifecycleState;
  recurringPrice: number | null;
  currency: string | null;
  nextRenewalDate: string | null;
  health: SubscriptionHealth;
  insights: SubscriptionInsightRecord[];
  recommendation: SubscriptionRecommendationRecord;
};

export class SubscriptionInsightService {
  private readonly recommendationService = new SubscriptionRecommendationService();

  async refreshForSubscriptions(
    userId: string,
    subscriptionIds: string[],
    options?: RefreshOptions
  ) {
    const uniqueSubscriptionIds = Array.from(new Set(subscriptionIds.filter(Boolean)));
    if (uniqueSubscriptionIds.length === 0) {
      return new Map<string, SubscriptionOptimizationRecord>();
    }

    const now = options?.now ?? new Date();
    const emitEvents = options?.emitEvents ?? false;
    const householdIds = await listActiveHouseholdIdsForUser(userId);
    const accessibleWhere = buildAccessibleWhere(userId, householdIds);

    const [subscriptions, allActiveSubscriptions] = await Promise.all([
      prisma.subscriptionRegistry.findMany({
        where: {
          id: { in: uniqueSubscriptionIds },
          ...accessibleWhere
        },
        include: {
          insights: true,
          recommendation: true,
          priceHistory: {
            orderBy: [{ createdAt: "desc" }],
            take: 24
          },
          lifecycleEvents: {
            orderBy: [{ createdAt: "desc" }],
            take: 16
          },
          evidence: {
            orderBy: [{ observedAt: "desc" }],
            take: 24
          },
          obligations: {
            select: {
              id: true,
              status: true,
              updatedAt: true
            },
            take: 20
          }
        }
      }),
      prisma.subscriptionRegistry.findMany({
        where: accessibleWhere,
        select: {
          id: true,
          vendorNormalizedKey: true,
          lifecycleState: true
        }
      })
    ]);

    const duplicateCounts = countDuplicates(allActiveSubscriptions);
    const result = new Map<string, SubscriptionOptimizationRecord>();

    for (const subscription of subscriptions) {
      const generatedInsights = buildInsights({
        subscription,
        now,
        duplicateCount: duplicateCounts.get(subscription.vendorNormalizedKey) ?? 1
      });

      const syncedInsights = await this.syncInsights(
        userId,
        subscription,
        generatedInsights,
        emitEvents
      );

      const recommendation = this.recommendationService.recommend({
        subscriptionId: subscription.id,
        lifecycleState: subscription.lifecycleState,
        confidenceScore: Number(subscription.sourceConfidenceScore),
        nextRenewalDate: subscription.nextRenewalDate,
        insights: generatedInsights,
        now
      });

      const syncedRecommendation = await this.syncRecommendation(
        userId,
        subscription,
        recommendation,
        emitEvents
      );

      const health = computeHealth({
        subscription,
        insights: syncedInsights,
        recommendation: syncedRecommendation
      });

      result.set(subscription.id, {
        subscriptionId: subscription.id,
        health,
        insights: syncedInsights,
        recommendation: syncedRecommendation
      });
    }

    return result;
  }

  async refreshForUser(userId: string, options?: RefreshOptions) {
    const householdIds = await listActiveHouseholdIdsForUser(userId);
    const accessibleWhere = buildAccessibleWhere(userId, householdIds);
    const subscriptions = await prisma.subscriptionRegistry.findMany({
      where: accessibleWhere,
      select: { id: true }
    });

    return this.refreshForSubscriptions(
      userId,
      subscriptions.map((item) => item.id),
      options
    );
  }

  async listActions(userId: string, limit = 40) {
    const optimization = await this.refreshForUser(userId, { emitEvents: false });
    if (optimization.size === 0) return [];

    const ids = Array.from(optimization.keys());
    const subscriptions = await prisma.subscriptionRegistry.findMany({
      where: {
        id: {
          in: ids
        }
      },
      select: {
        id: true,
        subscriptionTitle: true,
        vendorName: true,
        planName: true,
        lifecycleState: true,
        recurringPrice: true,
        currency: true,
        nextRenewalDate: true
      }
    });

    const items: SubscriptionActionItem[] = [];
    for (const subscription of subscriptions) {
      const item = optimization.get(subscription.id);
      if (!item) continue;
      items.push({
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.subscriptionTitle,
        vendorName: subscription.vendorName,
        planName: subscription.planName,
        lifecycleState: subscription.lifecycleState,
        recurringPrice: decimalToNumber(subscription.recurringPrice),
        currency: subscription.currency,
        nextRenewalDate: subscription.nextRenewalDate?.toISOString() ?? null,
        health: item.health,
        insights: item.insights,
        recommendation: item.recommendation
      });
    }

    return items
      .sort((a, b) => scoreActionItem(b) - scoreActionItem(a))
      .slice(0, limit);
  }

  private async syncInsights(
    userId: string,
    subscription: SubscriptionWithSignals,
    generated: SubscriptionInsightCandidate[],
    emitEvents: boolean
  ) {
    const byType = new Map(subscription.insights.map((item) => [item.insightType, item]));
    const synced: SubscriptionInsightRecord[] = [];
    const seenTypes = new Set<SubscriptionInsightType>();

    for (const insight of generated) {
      seenTypes.add(insight.insightType);
      const existing = byType.get(insight.insightType);

      if (!existing) {
        const created = await prisma.subscriptionInsight.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            insightType: insight.insightType,
            title: insight.title,
            description: insight.description,
            severity: insight.severity,
            confidenceScore: insight.confidence,
            metadata: toInputJson(insight.metadata),
            recommendedAction: insight.recommendedAction
          }
        });

        if (emitEvents) {
          await createAuditEvent({
            userId,
            eventType: "subscription_insight_created",
            metadata: {
              subscriptionId: subscription.id,
              insightType: insight.insightType,
              severity: insight.severity,
              confidence: insight.confidence
            }
          });
        }

        synced.push(mapInsight(created));
        continue;
      }

      if (insightEquals(existing, insight)) {
        synced.push(mapInsight(existing));
        continue;
      }

      const updated = await prisma.subscriptionInsight.update({
        where: { id: existing.id },
        data: {
          title: insight.title,
          description: insight.description,
          severity: insight.severity,
          confidenceScore: insight.confidence,
          metadata: toInputJson(insight.metadata),
          recommendedAction: insight.recommendedAction
        }
      });

      if (emitEvents) {
        await createAuditEvent({
          userId,
          eventType: "subscription_insight_created",
          metadata: {
            subscriptionId: subscription.id,
            insightType: insight.insightType,
            severity: insight.severity,
            confidence: insight.confidence,
            reason: "updated"
          }
        });
      }

      synced.push(mapInsight(updated));
    }

    const staleIds = subscription.insights
      .filter((item) => !seenTypes.has(item.insightType))
      .map((item) => item.id);

    if (staleIds.length > 0) {
      await prisma.subscriptionInsight.deleteMany({
        where: {
          id: {
            in: staleIds
          }
        }
      });
    }

    return synced.sort((a, b) => {
      const severityScore = compareSeverity(b.severity) - compareSeverity(a.severity);
      if (severityScore !== 0) return severityScore;
      return b.confidence - a.confidence;
    });
  }

  private async syncRecommendation(
    userId: string,
    subscription: SubscriptionWithSignals,
    next: SubscriptionRecommendationRecord,
    emitEvents: boolean
  ) {
    const existing = subscription.recommendation;
    if (!existing) {
      const created = await prisma.subscriptionRecommendation.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          recommendationType: next.recommendationType,
          reason: next.reason,
          confidenceScore: next.confidence,
          supportingInsights: next.supportingInsights
        }
      });

      if (emitEvents) {
        await createAuditEvent({
          userId,
          eventType: "subscription_recommendation_generated",
          metadata: {
            subscriptionId: subscription.id,
            recommendationType: next.recommendationType,
            confidence: next.confidence
          }
        });
      }

      return mapRecommendation(created);
    }

    if (recommendationEquals(existing, next)) {
      return mapRecommendation(existing);
    }

    const updated = await prisma.subscriptionRecommendation.update({
      where: {
        id: existing.id
      },
      data: {
        recommendationType: next.recommendationType,
        reason: next.reason,
        confidenceScore: next.confidence,
        supportingInsights: next.supportingInsights
      }
    });

    if (emitEvents) {
      await createAuditEvent({
        userId,
        eventType: "subscription_recommendation_generated",
        metadata: {
          subscriptionId: subscription.id,
          recommendationType: next.recommendationType,
          confidence: next.confidence,
          reason: "updated"
        }
      });
    }

    return mapRecommendation(updated);
  }
}

function buildInsights(input: {
  subscription: SubscriptionWithSignals;
  now: Date;
  duplicateCount: number;
}) {
  const insights: SubscriptionInsightCandidate[] = [];
  const subscription = input.subscription;
  const now = input.now;

  const recurringHistory = subscription.priceHistory
    .filter((item) => item.priceType === "RECURRING")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (recurringHistory.length >= 2) {
    const latest = Number(recurringHistory[0].amount);
    const previous = Number(recurringHistory[1].amount);
    if (previous > 0) {
      const deltaRatio = (latest - previous) / previous;
      if (deltaRatio >= PRICE_INCREASE_THRESHOLD) {
        const deltaAmount = latest - previous;
        insights.push({
          subscriptionId: subscription.id,
          insightType: SubscriptionInsightType.PRICE_INCREASE,
          title: `${subscription.vendorName} increased from ${formatMoney(previous, recurringHistory[1].currency)} to ${formatMoney(latest, recurringHistory[0].currency)}`,
          description: `Recurring price changed by ${Math.round(deltaRatio * 100)}% (${formatMoney(deltaAmount, recurringHistory[0].currency)}).`,
          severity:
            daysUntil(subscription.nextRenewalDate, now) !== null &&
            (daysUntil(subscription.nextRenewalDate, now) ?? 99) <= 7
              ? SubscriptionInsightSeverity.HIGH
              : SubscriptionInsightSeverity.MEDIUM,
          confidence: clamp(Number(subscription.sourceConfidenceScore) * 0.8 + 0.18, 0, 1),
          metadata: {
            oldPrice: previous,
            newPrice: latest,
            deltaAmount: Number(deltaAmount.toFixed(2)),
            deltaRatio: Number(deltaRatio.toFixed(4)),
            billingPeriod: subscription.billingPeriod
          },
          recommendedAction: "Review before the next renewal."
        });
      }
    }
  }

  const daysToRenewal = daysUntil(subscription.nextRenewalDate, now);
  if (
    daysToRenewal !== null &&
    daysToRenewal >= 0 &&
    daysToRenewal <= RENEWAL_WINDOW_DAYS &&
    isActiveLifecycle(subscription.lifecycleState)
  ) {
    insights.push({
      subscriptionId: subscription.id,
      insightType: SubscriptionInsightType.RENEWAL_UPCOMING,
      title: `${subscription.vendorName} renews in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}`,
      description: `Renewal is near${subscription.recurringPrice ? ` at ${formatMoney(Number(subscription.recurringPrice), subscription.currency ?? "USD")}` : ""}.`,
      severity: daysToRenewal <= 3 ? SubscriptionInsightSeverity.HIGH : SubscriptionInsightSeverity.MEDIUM,
      confidence: clamp(Number(subscription.sourceConfidenceScore) * 0.85 + 0.12, 0, 1),
      metadata: {
        nextRenewalDate: subscription.nextRenewalDate?.toISOString() ?? null,
        daysToRenewal
      },
      recommendedAction: "Decide keep, cancel, or downgrade before renewal."
    });
  }

  const unusedSignals = collectUnusedSignals(subscription, now);
  if (unusedSignals.length >= 2 && isActiveLifecycle(subscription.lifecycleState)) {
    insights.push({
      subscriptionId: subscription.id,
      insightType: SubscriptionInsightType.UNUSED_RISK,
      title: `${subscription.vendorName} may be underused`,
      description: "Low recent lifecycle activity suggests this subscription may no longer be valuable.",
      severity:
        daysToRenewal !== null && daysToRenewal <= 14
          ? SubscriptionInsightSeverity.HIGH
          : SubscriptionInsightSeverity.MEDIUM,
      confidence: clamp(0.46 + unusedSignals.length * 0.12, 0, 1),
      metadata: {
        signals: unusedSignals
      },
      recommendedAction: "Review usage and consider canceling or downgrading."
    });
  }

  if (
    subscription.sourceConfidenceBand === "LOW" ||
    Number(subscription.sourceConfidenceScore) < 0.48
  ) {
    insights.push({
      subscriptionId: subscription.id,
      insightType: SubscriptionInsightType.LOW_CONFIDENCE,
      title: "Subscription details have low confidence",
      description: "Lifecycle or pricing details are still uncertain and should be reviewed.",
      severity: SubscriptionInsightSeverity.MEDIUM,
      confidence: clamp(1 - Number(subscription.sourceConfidenceScore), 0.45, 0.88),
      metadata: {
        sourceConfidenceScore: Number(subscription.sourceConfidenceScore),
        sourceConfidenceBand: subscription.sourceConfidenceBand
      },
      recommendedAction: "Confirm key details to improve future recommendations."
    });
  }

  if (
    subscription.lifecycleState === "CANCELING" ||
    subscription.lifecycleState === "CANCELED" ||
    subscription.autoRenewStatus === "OFF"
  ) {
    insights.push({
      subscriptionId: subscription.id,
      insightType: SubscriptionInsightType.CANCELLATION_CONFIRMED,
      title: `${subscription.vendorName} cancellation detected`,
      description: "Cancellation or auto-renew off signal is present for this subscription.",
      severity: SubscriptionInsightSeverity.LOW,
      confidence: clamp(Number(subscription.sourceConfidenceScore) * 0.8 + 0.2, 0, 1),
      metadata: {
        lifecycleState: subscription.lifecycleState,
        autoRenewStatus: subscription.autoRenewStatus,
        cancellationEffectiveDate:
          subscription.cancellationEffectiveDate?.toISOString() ?? null
      },
      recommendedAction: "Confirm cancellation timeline and expected end of access."
    });
  }

  if (input.duplicateCount > 1 && isActiveLifecycle(subscription.lifecycleState)) {
    insights.push({
      subscriptionId: subscription.id,
      insightType: SubscriptionInsightType.DUPLICATE_SUBSCRIPTION,
      title: "Potential duplicate subscription",
      description: `Detected ${input.duplicateCount} active records for the same vendor key.`,
      severity: SubscriptionInsightSeverity.MEDIUM,
      confidence: 0.75,
      metadata: {
        duplicateCount: input.duplicateCount,
        vendorNormalizedKey: subscription.vendorNormalizedKey
      },
      recommendedAction: "Review and merge duplicates if they represent the same plan."
    });
  }

  const planMismatch = detectPlanMismatch(subscription);
  if (planMismatch) {
    insights.push({
      subscriptionId: subscription.id,
      insightType: SubscriptionInsightType.PLAN_MISMATCH,
      title: "Plan or pricing mismatch detected",
      description: "Recent charged amount diverges from the expected recurring price.",
      severity: SubscriptionInsightSeverity.MEDIUM,
      confidence: 0.74,
      metadata: planMismatch,
      recommendedAction: "Review plan name and recurring amount before renewal."
    });
  }

  if (isUnknownOrConflicted(subscription, now)) {
    insights.push({
      subscriptionId: subscription.id,
      insightType: SubscriptionInsightType.UNKNOWN_STATE,
      title: "Lifecycle state needs clarification",
      description: "Recent signals conflict or remain incomplete for this subscription.",
      severity: SubscriptionInsightSeverity.MEDIUM,
      confidence: 0.68,
      metadata: {
        lifecycleState: subscription.lifecycleState,
        recentLifecycleEvents: subscription.lifecycleEvents.slice(0, 4).map((item) => item.eventType)
      },
      recommendedAction: "Review and confirm lifecycle state."
    });
  }

  return dedupeInsightTypes(insights);
}

function computeHealth(input: {
  subscription: SubscriptionWithSignals;
  insights: SubscriptionInsightRecord[];
  recommendation: SubscriptionRecommendationRecord;
}): SubscriptionHealth {
  const rationale: string[] = [];
  let score = 25 + Number(input.subscription.sourceConfidenceScore) * 40;

  if (input.subscription.lifecycleState === "ACTIVE" || input.subscription.lifecycleState === "RENEWING") {
    score += 10;
    rationale.push("lifecycle_clear");
  }
  if (input.subscription.lifecycleState === "UNKNOWN") {
    score -= 16;
    rationale.push("lifecycle_unknown");
  }

  for (const insight of input.insights) {
    if (insight.insightType === "PRICE_INCREASE") score -= 10;
    if (insight.insightType === "RENEWAL_UPCOMING") score -= 6;
    if (insight.insightType === "UNUSED_RISK") score -= 14;
    if (insight.insightType === "LOW_CONFIDENCE") score -= 14;
    if (insight.insightType === "PLAN_MISMATCH") score -= 12;
    if (insight.insightType === "UNKNOWN_STATE") score -= 16;
    if (insight.insightType === "DUPLICATE_SUBSCRIPTION") score -= 18;
    if (insight.insightType === "CANCELLATION_CONFIRMED") score += 6;
  }

  if (input.recommendation.recommendationType === "KEEP") score += 4;
  if (input.recommendation.recommendationType === "REVIEW") score -= 6;
  if (input.recommendation.recommendationType === "CANCEL") score -= 8;

  const bounded = Math.round(clamp(score, 0, 100));
  const band = bounded >= 75 ? "GOOD" : bounded >= 45 ? "FAIR" : "AT_RISK";
  return {
    score: bounded,
    band,
    rationale
  };
}

function buildAccessibleWhere(userId: string, householdIds: string[]) {
  const householdFilter =
    householdIds.length > 0
      ? {
          scopeType: ScopeType.HOUSEHOLD,
          householdId: {
            in: householdIds
          }
        }
      : null;

  return {
    OR: [
      {
        userId,
        scopeType: ScopeType.PERSONAL
      },
      ...(householdFilter ? [householdFilter] : [])
    ]
  } satisfies Prisma.SubscriptionRegistryWhereInput;
}

function countDuplicates(
  items: Array<{
    id: string;
    vendorNormalizedKey: string;
    lifecycleState: string;
  }>
) {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!isActiveLifecycle(item.lifecycleState)) continue;
    const key = item.vendorNormalizedKey.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function collectUnusedSignals(subscription: SubscriptionWithSignals, now: Date) {
  const signals: string[] = [];
  const daysSinceCharge = daysSince(subscription.lastChargedDate, now);
  const daysSinceEvidence = daysSince(
    subscription.evidence[0]?.observedAt ?? null,
    now
  );
  const daysSinceInteraction = mostRecentInteractionDays(subscription, now);

  if (
    daysSinceCharge !== null &&
    daysSinceCharge >
      (subscription.billingPeriod === "YEARLY" ? UNUSED_YEARLY_DAYS : UNUSED_MONTHLY_DAYS)
  ) {
    signals.push("no_recent_charges");
  }
  if (daysSinceEvidence !== null && daysSinceEvidence > 90) {
    signals.push("no_recent_lifecycle_signals");
  }
  if (daysSinceInteraction !== null && daysSinceInteraction > 90) {
    signals.push("no_recent_user_interaction");
  }
  if (Number(subscription.sourceConfidenceScore) < 0.58) {
    signals.push("low_source_confidence");
  }
  return signals;
}

function detectPlanMismatch(subscription: SubscriptionWithSignals) {
  const recurringPrice =
    subscription.recurringPrice !== null ? Number(subscription.recurringPrice) : null;
  const chargedPrice =
    subscription.amountLastCharged !== null ? Number(subscription.amountLastCharged) : null;
  if (recurringPrice === null || chargedPrice === null || recurringPrice <= 0) return null;

  const diffRatio = Math.abs(chargedPrice - recurringPrice) / recurringPrice;
  if (diffRatio < 0.15) return null;

  return {
    recurringPrice,
    chargedPrice,
    difference: Number((chargedPrice - recurringPrice).toFixed(2)),
    differenceRatio: Number(diffRatio.toFixed(4))
  };
}

function isUnknownOrConflicted(subscription: SubscriptionWithSignals, now: Date) {
  if (subscription.lifecycleState === "UNKNOWN") return true;

  const recentEvents = subscription.lifecycleEvents.filter(
    (item) => daysSince(item.createdAt, now) !== null && (daysSince(item.createdAt, now) ?? 365) <= 45
  );
  const hasCancellation = recentEvents.some((item) =>
    item.eventType === "CANCELLATION_DETECTED" || item.eventType === "CANCELED"
  );
  const hasActivation = recentEvents.some((item) =>
    item.eventType === "ACTIVATED" || item.eventType === "RECEIPT_CAPTURED" || item.eventType === "REACTIVATED"
  );

  return hasCancellation && hasActivation;
}

function mostRecentInteractionDays(subscription: SubscriptionWithSignals, now: Date) {
  const dates: Date[] = [];
  if (subscription.updatedAt) dates.push(subscription.updatedAt);
  for (const item of subscription.obligations) {
    dates.push(item.updatedAt);
  }
  if (dates.length === 0) return null;
  const latest = dates.reduce((acc, value) => (value > acc ? value : acc), dates[0]);
  return daysSince(latest, now);
}

function dedupeInsightTypes(items: SubscriptionInsightCandidate[]) {
  const bestByType = new Map<SubscriptionInsightType, SubscriptionInsightCandidate>();
  for (const item of items) {
    const current = bestByType.get(item.insightType);
    if (!current) {
      bestByType.set(item.insightType, item);
      continue;
    }
    if (compareSeverity(item.severity) > compareSeverity(current.severity)) {
      bestByType.set(item.insightType, item);
      continue;
    }
    if (item.confidence > current.confidence) {
      bestByType.set(item.insightType, item);
    }
  }
  return Array.from(bestByType.values());
}

function mapInsight(
  entry: Prisma.SubscriptionInsightGetPayload<Record<string, never>>
): SubscriptionInsightRecord {
  return {
    id: entry.id,
    subscriptionId: entry.subscriptionId,
    insightType: entry.insightType,
    title: entry.title,
    description: entry.description,
    severity: entry.severity,
    confidence: Number(entry.confidenceScore),
    metadata: asRecord(entry.metadata),
    recommendedAction: entry.recommendedAction,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  };
}

function mapRecommendation(
  entry: Prisma.SubscriptionRecommendationGetPayload<Record<string, never>>
): SubscriptionRecommendationRecord {
  return {
    subscriptionId: entry.subscriptionId,
    recommendationType: entry.recommendationType,
    reason: entry.reason,
    confidence: Number(entry.confidenceScore),
    supportingInsights: asInsightTypes(entry.supportingInsights),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  };
}

function insightEquals(
  existing: Prisma.SubscriptionInsightGetPayload<Record<string, never>>,
  next: SubscriptionInsightCandidate
) {
  return (
    existing.title === next.title &&
    existing.description === next.description &&
    existing.severity === next.severity &&
    Math.abs(Number(existing.confidenceScore) - next.confidence) < 0.0001 &&
    existing.recommendedAction === next.recommendedAction &&
    stringifyJson(existing.metadata) === stringifyJson(next.metadata)
  );
}

function recommendationEquals(
  existing: Prisma.SubscriptionRecommendationGetPayload<Record<string, never>>,
  next: SubscriptionRecommendationRecord
) {
  return (
    existing.recommendationType === next.recommendationType &&
    existing.reason === next.reason &&
    Math.abs(Number(existing.confidenceScore) - next.confidence) < 0.0001 &&
    stringifyJson(existing.supportingInsights) === stringifyJson(next.supportingInsights)
  );
}

function scoreActionItem(item: SubscriptionActionItem) {
  let score = item.health.score;
  for (const insight of item.insights) {
    if (insight.insightType === "RENEWAL_UPCOMING") score += 26;
    if (insight.insightType === "PRICE_INCREASE") score += 24;
    if (insight.insightType === "UNUSED_RISK") score += 22;
    if (insight.insightType === "LOW_CONFIDENCE") score += 14;
    if (insight.severity === "HIGH") score += 8;
  }
  if (item.recommendation.recommendationType === "REVIEW") score += 10;
  if (item.recommendation.recommendationType === "CANCEL") score += 12;
  return score;
}

function isActiveLifecycle(state: string) {
  return ACTIVE_LIFECYCLE_STATES.has(state);
}

function compareSeverity(value: SubscriptionInsightSeverity) {
  if (value === SubscriptionInsightSeverity.HIGH) return 3;
  if (value === SubscriptionInsightSeverity.MEDIUM) return 2;
  return 1;
}

function daysUntil(value: Date | null, now: Date) {
  if (!value) return null;
  return Math.floor((value.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function daysSince(value: Date | null, now: Date) {
  if (!value) return null;
  return Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000));
}

function decimalToNumber(value: Prisma.Decimal | null) {
  return value ? Number(value) : null;
}

function formatMoney(amount: number, currency: string | null) {
  const code = (currency ?? "USD").toUpperCase();
  return `${code} ${amount.toFixed(2)}`;
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asInsightTypes(value: unknown): SubscriptionInsightType[] {
  if (!Array.isArray(value)) return [];
  const output: SubscriptionInsightType[] = [];
  for (const entry of value) {
    if (
      entry === "PRICE_INCREASE" ||
      entry === "RENEWAL_UPCOMING" ||
      entry === "UNUSED_RISK" ||
      entry === "LOW_CONFIDENCE" ||
      entry === "CANCELLATION_CONFIRMED" ||
      entry === "DUPLICATE_SUBSCRIPTION" ||
      entry === "PLAN_MISMATCH" ||
      entry === "UNKNOWN_STATE"
    ) {
      output.push(entry);
    }
  }
  return output;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function toInputJson(value: Record<string, unknown> | null) {
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
