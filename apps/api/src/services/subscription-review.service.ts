import { ScopeType, SubscriptionInsightSeverity, SubscriptionRecommendationType } from "@prisma/client";
import { createAuditEvent } from "../observability/audit-event";
import { SubscriptionReviewRepository } from "../repositories/subscription-review.repository";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";
import { SubscriptionInsightService } from "./subscription-insight.service";

const HIGH_PRIORITY_GROUP_ORDER = [
  "RENEWING_SOON",
  "PRICE_INCREASED",
  "NEEDS_CONFIRMATION",
  "POTENTIALLY_UNUSED",
  "RECENTLY_CANCELED",
  "STABLE_SAFE"
] as const;

type GroupKey = (typeof HIGH_PRIORITY_GROUP_ORDER)[number];

type ReviewHubItem = {
  subscriptionId: string;
  title: string;
  vendorName: string;
  planName: string | null;
  lifecycleState: string;
  recurringPrice: number | null;
  currency: string | null;
  nextRenewalDate: string | null;
  recommendationType: string;
  recommendationReason: string;
  healthScore: number;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  primaryInsight: string;
  assignee: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  scopeType: ScopeType;
};

type ReviewHubGroup = {
  key: GroupKey;
  title: string;
  description: string;
  items: ReviewHubItem[];
};

type ReviewHubResponse = {
  summary: {
    totalReviewItems: number;
    renewingSoonCount: number;
    priceIncreasedCount: number;
    needsConfirmationCount: number;
    potentialSavingsAmount: number;
    currency: string | null;
  };
  groups: ReviewHubGroup[];
};

type Candidate = {
  group: GroupKey;
  score: number;
  daysToRenewal: number | null;
  recommendationType: string;
  recurringPrice: number | null;
  currency: string | null;
  item: ReviewHubItem;
};

type BuildOptions = {
  emitAudit: boolean;
};

const REVIEW_NOISE_SUPPRESSION_HOURS = 72;

export class SubscriptionReviewService {
  private readonly repository = new SubscriptionReviewRepository();
  private readonly insightService = new SubscriptionInsightService();

  async getReviewHub(userId: string): Promise<ReviewHubResponse> {
    return this.buildHub(userId, { emitAudit: true });
  }

  async getNextReviewSubscriptionId(userId: string, currentSubscriptionId: string) {
    const hub = await this.buildHub(userId, { emitAudit: false });
    for (const group of hub.groups) {
      const next = group.items.find((item) => item.subscriptionId !== currentSubscriptionId);
      if (next) return next.subscriptionId;
    }
    return null;
  }

  private async buildHub(userId: string, options: BuildOptions): Promise<ReviewHubResponse> {
    const householdIds = await listActiveHouseholdIdsForUser(userId);

    const [optimizationMap, subscriptions, recentReviewEvents] = await Promise.all([
      this.insightService.refreshForUser(userId, { emitEvents: false }),
      this.repository.listAccessibleSubscriptions({
        userId,
        householdIds
      }),
      this.repository.listRecentAuditEvents({
        userId,
        eventTypes: [
          "subscription_review_keep_selected",
          "subscription_review_cancel_selected",
          "subscription_review_remind_selected",
          "subscription_review_completed",
          "subscription_decision_taken"
        ],
        since: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
        limit: 800
      })
    ]);

    const recentlyReviewedAt = indexRecentReviewEvents(recentReviewEvents);
    const candidates: Candidate[] = [];

    for (const subscription of subscriptions) {
      const optimization = optimizationMap.get(subscription.id);
      if (!optimization) continue;

      const recommendation = optimization.recommendation;
      const insights = [...optimization.insights].sort((a, b) => {
        const severityDelta = compareSeverity(b.severity) - compareSeverity(a.severity);
        if (severityDelta !== 0) return severityDelta;
        return b.confidence - a.confidence;
      });

      const daysToRenewal = daysUntil(subscription.nextRenewalDate, new Date());
      const classification = classifySubscription({
        lifecycleState: subscription.lifecycleState,
        recommendationType: recommendation.recommendationType,
        confidenceBand: subscription.sourceConfidenceBand,
        insights,
        daysToRenewal
      });

      const lastReviewedAt = recentlyReviewedAt.get(subscription.id);
      if (
        lastReviewedAt &&
        Date.now() - lastReviewedAt.getTime() < REVIEW_NOISE_SUPPRESSION_HOURS * 60 * 60 * 1000 &&
        classification.score < 90
      ) {
        continue;
      }

      if (classification.group === "STABLE_SAFE" && recommendation.recommendationType === "IGNORE") {
        continue;
      }

      candidates.push({
        group: classification.group,
        score: classification.score,
        daysToRenewal,
        recommendationType: recommendation.recommendationType,
        recurringPrice: subscription.recurringPrice ? Number(subscription.recurringPrice) : null,
        currency: subscription.currency,
        item: {
          subscriptionId: subscription.id,
          title: subscription.subscriptionTitle,
          vendorName: subscription.vendorName,
          planName: subscription.planName,
          lifecycleState: subscription.lifecycleState,
          recurringPrice: subscription.recurringPrice ? Number(subscription.recurringPrice) : null,
          currency: subscription.currency,
          nextRenewalDate: subscription.nextRenewalDate?.toISOString() ?? null,
          recommendationType: recommendation.recommendationType,
          recommendationReason: recommendation.reason,
          healthScore: optimization.health.score,
          confidenceBand: subscription.sourceConfidenceBand,
          primaryInsight:
            insights[0]?.title ??
            recommendation.reason ??
            "Nothing major stands out right now. We will watch for changes.",
          assignee: subscription.assignedToUser
            ? {
                id: subscription.assignedToUser.id,
                email: subscription.assignedToUser.email,
                name: subscription.assignedToUser.name
              }
            : null,
          scopeType: subscription.scopeType
        }
      });
    }

    const grouped = new Map<GroupKey, Candidate[]>();
    for (const key of HIGH_PRIORITY_GROUP_ORDER) {
      grouped.set(key, []);
    }

    for (const candidate of candidates) {
      grouped.get(candidate.group)?.push(candidate);
    }

    for (const [key, items] of grouped) {
      items.sort((a, b) => {
        const scoreDelta = b.score - a.score;
        if (scoreDelta !== 0) return scoreDelta;

        const aRenewal = a.daysToRenewal ?? Number.MAX_SAFE_INTEGER;
        const bRenewal = b.daysToRenewal ?? Number.MAX_SAFE_INTEGER;
        if (aRenewal !== bRenewal) return aRenewal - bRenewal;

        return a.item.title.localeCompare(b.item.title);
      });

      if (key === "STABLE_SAFE" && items.length > 3) {
        grouped.set(key, items.slice(0, 3));
      }
    }

    const groups = HIGH_PRIORITY_GROUP_ORDER.flatMap((key): ReviewHubGroup[] => {
      const items = grouped.get(key) ?? [];
      if (items.length === 0) return [];
      return [
        {
          key,
          title: groupTitle(key),
          description: groupDescription(key),
          items: items.map((entry) => entry.item)
        }
      ];
    });

    const savingsCandidates = candidates.filter(
      (entry) =>
        entry.recommendationType === SubscriptionRecommendationType.CANCEL ||
        entry.recommendationType === SubscriptionRecommendationType.DOWNGRADE
    );

    const potentialSavingsAmount = roundCurrency(
      savingsCandidates.reduce((sum, item) => sum + (item.recurringPrice ?? 0), 0)
    );
    const currency = mostCommonCurrency(savingsCandidates.map((item) => item.currency));

    const response: ReviewHubResponse = {
      summary: {
        totalReviewItems: groups.reduce((sum, group) => sum + group.items.length, 0),
        renewingSoonCount: groups.find((group) => group.key === "RENEWING_SOON")?.items.length ?? 0,
        priceIncreasedCount: groups.find((group) => group.key === "PRICE_INCREASED")?.items.length ?? 0,
        needsConfirmationCount:
          groups.find((group) => group.key === "NEEDS_CONFIRMATION")?.items.length ?? 0,
        potentialSavingsAmount,
        currency
      },
      groups
    };

    if (options.emitAudit) {
      await createAuditEvent({
        userId,
        eventType: "subscription_review_hub_loaded",
        metadata: {
          totalReviewItems: response.summary.totalReviewItems,
          renewingSoonCount: response.summary.renewingSoonCount,
          priceIncreasedCount: response.summary.priceIncreasedCount,
          needsConfirmationCount: response.summary.needsConfirmationCount,
          potentialSavingsAmount: response.summary.potentialSavingsAmount,
          currency: response.summary.currency,
          groupCount: response.groups.length
        }
      });

      if (response.summary.totalReviewItems === 0) {
        await createAuditEvent({
          userId,
          eventType: "subscription_review_hub_empty",
          metadata: {
            reason: "no_high_priority_review_items"
          }
        });
      }
    }

    return response;
  }
}

function classifySubscription(input: {
  lifecycleState: string;
  recommendationType: SubscriptionRecommendationType;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  insights: Array<{
    insightType: string;
    severity: SubscriptionInsightSeverity;
  }>;
  daysToRenewal: number | null;
}) {
  const insightTypes = new Set(input.insights.map((item) => item.insightType));
  const has = (value: string) => insightTypes.has(value);

  const hasRenewalSoon =
    input.daysToRenewal !== null && input.daysToRenewal >= 0 && input.daysToRenewal <= 7;
  const hasPriceIncrease = has("PRICE_INCREASE");
  const needsConfirmation =
    has("LOW_CONFIDENCE") ||
    has("UNKNOWN_STATE") ||
    has("PLAN_MISMATCH") ||
    input.confidenceBand === "LOW";
  const cancellationConflict =
    (input.lifecycleState === "CANCELING" || input.lifecycleState === "CANCELED") &&
    (has("RENEWAL_UPCOMING") || has("PRICE_INCREASE") || hasRenewalSoon);
  const recentlyCanceled =
    input.lifecycleState === "CANCELING" ||
    input.lifecycleState === "CANCELED" ||
    has("CANCELLATION_CONFIRMED");
  const potentiallyUnused = has("UNUSED_RISK");

  let score = 0;
  if (hasRenewalSoon) score += 110 - Math.max(input.daysToRenewal ?? 0, 0) * 2;
  if (hasPriceIncrease) score += 96;
  if (needsConfirmation) score += 82;
  if (cancellationConflict) score += 74;
  if (potentiallyUnused) score += 64;
  if (recentlyCanceled) score += 38;
  if (input.recommendationType === "CANCEL") score += 24;
  if (input.recommendationType === "REVIEW") score += 18;

  for (const insight of input.insights) {
    if (insight.severity === "HIGH") score += 8;
    if (insight.severity === "MEDIUM") score += 4;
  }

  if (hasRenewalSoon) {
    return {
      group: "RENEWING_SOON" as const,
      score
    };
  }

  if (hasPriceIncrease) {
    return {
      group: "PRICE_INCREASED" as const,
      score
    };
  }

  if (needsConfirmation || cancellationConflict) {
    return {
      group: "NEEDS_CONFIRMATION" as const,
      score
    };
  }

  if (potentiallyUnused) {
    return {
      group: "POTENTIALLY_UNUSED" as const,
      score
    };
  }

  if (recentlyCanceled) {
    return {
      group: "RECENTLY_CANCELED" as const,
      score
    };
  }

  return {
    group: "STABLE_SAFE" as const,
    score: Math.max(10, score)
  };
}

function groupTitle(key: GroupKey) {
  if (key === "RENEWING_SOON") return "Renewing Soon";
  if (key === "PRICE_INCREASED") return "Price Increased";
  if (key === "NEEDS_CONFIRMATION") return "Needs Confirmation";
  if (key === "POTENTIALLY_UNUSED") return "Potentially Unused";
  if (key === "RECENTLY_CANCELED") return "Recently Canceled / Canceling";
  return "Stable / Safe";
}

function groupDescription(key: GroupKey) {
  if (key === "RENEWING_SOON") {
    return "Renewals in the next 7 days that likely need a keep/cancel decision.";
  }
  if (key === "PRICE_INCREASED") {
    return "Recurring price increased based on recent subscription evidence.";
  }
  if (key === "NEEDS_CONFIRMATION") {
    return "Details still need a quick check before deciding.";
  }
  if (key === "POTENTIALLY_UNUSED") {
    return "Light usage suggests this is worth a quick review.";
  }
  if (key === "RECENTLY_CANCELED") {
    return "Cancellation state items that still need acknowledgment or follow-up.";
  }
  return "Stable subscriptions with low immediate risk, shown with lower emphasis.";
}

function daysUntil(value: Date | null, now: Date) {
  if (!value) return null;
  return Math.floor((value.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function compareSeverity(value: SubscriptionInsightSeverity) {
  if (value === SubscriptionInsightSeverity.HIGH) return 3;
  if (value === SubscriptionInsightSeverity.MEDIUM) return 2;
  return 1;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function mostCommonCurrency(values: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  if (counts.size === 0) return "USD";

  let best: { code: string; count: number } | null = null;
  for (const [code, count] of counts) {
    if (!best || count > best.count) {
      best = { code, count };
    }
  }
  return best?.code ?? "USD";
}

function indexRecentReviewEvents(
  events: Array<{
    metadata: unknown;
    createdAt: Date;
  }>
) {
  const map = new Map<string, Date>();
  for (const event of events) {
    const metadata = asRecord(event.metadata);
    const subscriptionId = typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null;
    if (!subscriptionId) continue;

    const previous = map.get(subscriptionId);
    if (!previous || previous.getTime() < event.createdAt.getTime()) {
      map.set(subscriptionId, event.createdAt);
    }
  }
  return map;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
