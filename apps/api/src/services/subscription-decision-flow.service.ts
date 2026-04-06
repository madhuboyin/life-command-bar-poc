import { SubscriptionRegistryRepository } from "../repositories/subscription-registry.repository";
import { SubscriptionInsightService } from "./subscription-insight.service";
import { AppError } from "../utils/app-error";

export class SubscriptionDecisionFlowService {
  private readonly registryRepository = new SubscriptionRegistryRepository();
  private readonly insightService = new SubscriptionInsightService();

  async getDecisionFlow(userId: string, subscriptionId: string) {
    const existing = await this.registryRepository.findForUserStrict(subscriptionId, userId);
    if (!existing) {
        throw new AppError("NOT_FOUND", "Subscription not found", 404);
    }

    const optimizationMap = await this.insightService.refreshForSubscriptions(userId, [subscriptionId], { emitEvents: false });
    const optimization = optimizationMap.get(subscriptionId);

    if (!optimization) {
        throw new AppError("NOT_FOUND", "Subscription optimization data not found", 404);
    }

    // Build the swift decision context payload
    const recommendation = optimization.recommendation;
    const insights = optimization.insights;

    let whatChanged = "Regular renewal upcoming";
    let riskLevel = "LOW";
    
    if (insights.some(i => i.insightType === "PRICE_INCREASE")) {
        whatChanged = "Price has increased recently";
        riskLevel = "MEDIUM";
    } else if (insights.some(i => i.insightType === "UNUSED_RISK")) {
        whatChanged = "Detected as potentially unused";
        riskLevel = "HIGH";
    }

    // Fetch price history safely - registryRepository supports listing history if we have methods, 
    // or we can just fetch via Prisma inside the repo if needed. For now we use basic insights.
    // Assuming optimization.insights gives enough context. We'll simulate detailSections with what we know.
    
    return {
        subscription: {
          id: existing.id,
          title: existing.subscriptionTitle,
          vendorName: existing.vendorName,
          planName: existing.planName,
          lifecycleState: existing.lifecycleState,
          recurringPrice: existing.recurringPrice ? Number(existing.recurringPrice) : null,
          currency: existing.currency ?? "USD",
          nextRenewalDate: existing.nextRenewalDate ? existing.nextRenewalDate.toISOString() : null,
          confidenceBand: existing.sourceConfidenceBand,
          healthScore: optimization.health.score
        },
        recommendation: {
          type: recommendation?.recommendationType ?? "REVIEW",
          reason: recommendation?.reason ?? "No explicit recommendation at this time.",
          confidence: recommendation?.confidence ?? 0,
          supportingInsights: insights.map(i => i.title)
        },
        decisionContext: {
          whatChanged,
          whyNow: insights.length > 0 ? insights[0].description : "Routine check.",
          riskLevel,
          sourceSummary: existing.sourceConfidenceBand === "HIGH" ? "Verified via Gmail Receipts" : "Partially verified signals"
        },
        actions: [
          { key: "KEEP", label: "Keep" },
          { key: "CANCEL", label: "Cancel" },
          { key: "REMIND_LATER", label: "Remind me later" }
        ],
        detailSections: {
          priceHistory: [], // Placeholder for expanded timeline component 
          evidenceSummary: insights.map(i => ({ title: i.title, desc: i.description })),
          lifecycleTimeline: [] 
        }
    };
  }
}
