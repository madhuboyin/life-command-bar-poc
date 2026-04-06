import { SubscriptionLifecycleState, SubscriptionRecommendationType, ScopeType, SubscriptionInsightType, Prisma } from "@prisma/client";
import { SubscriptionRegistryRepository } from "../repositories/subscription-registry.repository";
import { SubscriptionInsightService } from "./subscription-insight.service";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";

export interface SubscriptionReviewItem {
  subscriptionId: string;
  title: string;
  vendorName: string;
  planName: string | null;
  lifecycleState: SubscriptionLifecycleState;
  recurringPrice: number | null;
  currency: string | null;
  nextRenewalDate: string | null;
  recommendationType: SubscriptionRecommendationType | "REVIEW";
  recommendationReason: string;
  healthScore: number;
  confidenceBand: string;
  primaryInsight: string | null;
  assignee: string | null;
  scopeType: ScopeType;
}

export interface SubscriptionReviewGroup {
  key: string;
  title: string;
  description: string;
  items: SubscriptionReviewItem[];
}

export interface SubscriptionReviewSummary {
  totalReviewItems: number;
  renewingSoonCount: number;
  priceIncreasedCount: number;
  needsConfirmationCount: number;
  potentialSavingsAmount: number;
  currency: string;
}

export interface SubscriptionReviewHubData {
  summary: SubscriptionReviewSummary;
  groups: SubscriptionReviewGroup[];
}

export class SubscriptionReviewService {
  private readonly registryRepository = new SubscriptionRegistryRepository();
  private readonly insightService = new SubscriptionInsightService();

  async getReviewHubData(userId: string): Promise<SubscriptionReviewHubData> {
    const householdIds = await listActiveHouseholdIdsForUser(userId);
    
    // Fetch all active/renewing or price-changed subscriptions
    const data = await this.registryRepository.listForUser({
      userId,
      householdIds,
      limit: 100, // Sufficient for review hub
      offset: 0
    });

    const activeItems = data.items.filter(item => 
      item.lifecycleState !== "CANCELED" && 
      item.lifecycleState !== "ENDED" && 
      item.lifecycleState !== "INACTIVE"
    );

    const activeIds = activeItems.map(i => i.id);
    const optimizations = await this.insightService.refreshForSubscriptions(userId, activeIds, { emitEvents: false });

    const renewingSoon: SubscriptionReviewItem[] = [];
    const priceIncreased: SubscriptionReviewItem[] = [];
    const needsConfirmation: SubscriptionReviewItem[] = [];
    const potentiallyUnused: SubscriptionReviewItem[] = [];
    const stable: SubscriptionReviewItem[] = [];

    let potentialSavings = 0;

    for (const sub of activeItems) {
      const opt = optimizations.get(sub.id);
      if (!opt) continue;

      const reviewItem: SubscriptionReviewItem = {
        subscriptionId: sub.id,
        title: sub.subscriptionTitle,
        vendorName: sub.vendorName,
        planName: sub.planName,
        lifecycleState: sub.lifecycleState,
        recurringPrice: sub.recurringPrice ? Number(sub.recurringPrice) : null,
        currency: sub.currency ?? "USD",
        nextRenewalDate: sub.nextRenewalDate ? sub.nextRenewalDate.toISOString() : null,
        recommendationType: opt.recommendation?.recommendationType ?? "REVIEW",
        recommendationReason: opt.recommendation?.reason ?? "Needs review",
        healthScore: opt.health.score,
        confidenceBand: sub.sourceConfidenceBand,
        primaryInsight: opt.insights.length > 0 ? opt.insights[0].title : null,
        assignee: sub.assignedToUserId,
        scopeType: sub.scopeType,
      };

      const hasCancelOrDowngrade = reviewItem.recommendationType === "CANCEL" || reviewItem.recommendationType === "DOWNGRADE";
      if (hasCancelOrDowngrade && reviewItem.recurringPrice) {
        potentialSavings += reviewItem.recurringPrice;
      }

      // Categorization logic based on insight types or recommendation
      const insightTypes = opt.insights.map(i => i.insightType as "RENEWAL_UPCOMING" | "PRICE_INCREASE" | "LOW_CONFIDENCE" | "UNUSED_RISK" | string);

      if (insightTypes.includes("RENEWAL_UPCOMING")) {
        renewingSoon.push(reviewItem);
      } else if (insightTypes.includes("PRICE_INCREASE")) {
        priceIncreased.push(reviewItem);
      } else if (insightTypes.includes("LOW_CONFIDENCE") || reviewItem.recommendationType === "CONFIRM") {
        needsConfirmation.push(reviewItem);
      } else if (insightTypes.includes("UNUSED_RISK") || hasCancelOrDowngrade) {
        potentiallyUnused.push(reviewItem);
      } else {
        stable.push(reviewItem);
      }
    }

    const groups: SubscriptionReviewGroup[] = [];

    if (renewingSoon.length > 0) {
      groups.push({
        key: "renewing_soon",
        title: "Renewing Soon",
        description: "Review these subscriptions before your card is charged again.",
        items: renewingSoon.sort((a, b) => this.compareDates(a.nextRenewalDate, b.nextRenewalDate))
      });
    }

    if (priceIncreased.length > 0) {
      groups.push({
        key: "price_increased",
        title: "Price Increased",
        description: "These subscriptions have recently increased in price.",
        items: priceIncreased.sort((a, b) => (b.recurringPrice ?? 0) - (a.recurringPrice ?? 0))
      });
    }

    if (needsConfirmation.length > 0) {
      groups.push({
        key: "needs_confirmation",
        title: "Needs Confirmation",
        description: "We found these but need you to confirm they are active.",
        items: needsConfirmation
      });
    }

    if (potentiallyUnused.length > 0) {
      groups.push({
        key: "potentially_unused",
        title: "Potentially Unused",
        description: "You may not be getting the full value out of these.",
        items: potentiallyUnused.sort((a, b) => (b.recurringPrice ?? 0) - (a.recurringPrice ?? 0))
      });
    }

    // De-emphasize stable items by appending at the very end
    if (stable.length > 0 && groups.length === 0) {
      // Only show stable if nothing else needs review, or maybe always show but bottom? 
      // User said "Do not let stable/safe dominate the page."
      groups.push({
        key: "stable",
        title: "Safe & Stable",
        description: "These subscriptions look healthy and have no upcoming surprises.",
        items: stable.slice(0, 5) // Limit just so it's not a huge wall
      });
    }

    const summary: SubscriptionReviewSummary = {
      totalReviewItems: renewingSoon.length + priceIncreased.length + needsConfirmation.length + potentiallyUnused.length,
      renewingSoonCount: renewingSoon.length,
      priceIncreasedCount: priceIncreased.length,
      needsConfirmationCount: needsConfirmation.length,
      potentialSavingsAmount: potentialSavings,
      currency: "USD"
    };

    return {
      summary,
      groups
    };
  }

  private compareDates(a: string | null, b: string | null): number {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return new Date(a).getTime() - new Date(b).getTime();
  }
}
