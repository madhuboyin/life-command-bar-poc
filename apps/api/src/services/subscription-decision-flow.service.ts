import { SubscriptionInsightSeverity } from "@prisma/client";
import { createAuditEvent } from "../observability/audit-event";
import { SubscriptionReviewRepository } from "../repositories/subscription-review.repository";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";
import { SubscriptionInsightService } from "./subscription-insight.service";
import { PersonalizationSignalService } from "./personalization-signal.service";
import { BehaviorProfileService } from "./behavior-profile.service";

const ACTIONS = [
  { key: "KEEP", label: "Keep" },
  { key: "CANCEL", label: "Cancel" },
  { key: "REMIND_LATER", label: "Remind me later" },
  { key: "REVIEW_DETAILS", label: "Review details" }
] as const;

export class SubscriptionDecisionFlowService {
  private readonly repository = new SubscriptionReviewRepository();
  private readonly insightService = new SubscriptionInsightService();
  private readonly personalizationSignalService = new PersonalizationSignalService();
  private readonly behaviorProfileService = new BehaviorProfileService();

  async getReviewFlow(userId: string, subscriptionId: string) {
    const householdIds = await listActiveHouseholdIdsForUser(userId);
    const [detail, optimizationMap] = await Promise.all([
      this.repository.findDetailById({
        id: subscriptionId,
        userId,
        householdIds
      }),
      this.insightService.refreshForSubscriptions(userId, [subscriptionId], {
        emitEvents: false
      })
    ]);

    if (!detail) return null;
    const optimization = optimizationMap.get(subscriptionId);
    if (!optimization) return null;

    const topInsights = [...optimization.insights].sort((a, b) => {
      const severityDelta = compareSeverity(b.severity) - compareSeverity(a.severity);
      if (severityDelta !== 0) return severityDelta;
      return b.confidence - a.confidence;
    });

    const daysToRenewal = daysUntil(detail.nextRenewalDate, new Date());

    await createAuditEvent({
      userId,
      householdId: detail.householdId,
      eventType: "subscription_review_item_opened",
      metadata: {
        subscriptionId,
        recommendationType: optimization.recommendation.recommendationType,
        daysToRenewal
      }
    });

    await this.personalizationSignalService
      .recordSignals([
        {
          userId,
          signalType: "DETAIL_OPENED",
          itemId: subscriptionId,
          category: "SUBSCRIPTION",
          source: "SUBSCRIPTION_REVIEW",
          metadata: {
            recommendationType: optimization.recommendation.recommendationType
          }
        },
        {
          userId,
          signalType: "REVIEW_STARTED",
          itemId: subscriptionId,
          category: "SUBSCRIPTION",
          source: "SUBSCRIPTION_REVIEW",
          metadata: {
            recommendationType: optimization.recommendation.recommendationType
          }
        }
      ])
      .catch(() => null);
    void this.behaviorProfileService.recomputeBehaviorProfile(userId).catch(() => null);

    return {
      subscription: {
        id: detail.id,
        title: detail.subscriptionTitle,
        vendorName: detail.vendorName,
        planName: detail.planName,
        lifecycleState: detail.lifecycleState,
        recurringPrice: detail.recurringPrice ? Number(detail.recurringPrice) : null,
        currency: detail.currency,
        nextRenewalDate: detail.nextRenewalDate?.toISOString() ?? null,
        confidenceBand: detail.sourceConfidenceBand,
        healthScore: optimization.health.score,
        scopeType: detail.scopeType,
        assignee: detail.assignedToUser
          ? {
              id: detail.assignedToUser.id,
              email: detail.assignedToUser.email,
              name: detail.assignedToUser.name
            }
          : null,
        lastHandledBy: detail.lastHandledByUser
          ? {
              id: detail.lastHandledByUser.id,
              email: detail.lastHandledByUser.email,
              name: detail.lastHandledByUser.name
            }
          : null,
        whyVisible: buildVisibilityReason({
          scopeType: detail.scopeType,
          assigneeName: detail.assignedToUser?.name ?? null,
          daysToRenewal,
          recommendationType: optimization.recommendation.recommendationType
        })
      },
      recommendation: {
        type: optimization.recommendation.recommendationType,
        reason: optimization.recommendation.reason,
        confidence: optimization.recommendation.confidence,
        supportingInsights: topInsights.map((item) => ({
          insightType: item.insightType,
          title: item.title,
          description: item.description,
          severity: item.severity,
          confidence: item.confidence,
          recommendedAction: item.recommendedAction
        }))
      },
      decisionContext: {
        whatChanged: buildWhatChanged(topInsights, detail),
        whyNow: buildWhyNow(daysToRenewal, topInsights),
        riskLevel: deriveRiskLevel(topInsights),
        sourceSummary: buildSourceSummary(detail.evidence)
      },
      actions: ACTIONS,
      detailSections: {
        priceHistory: detail.priceHistory.slice(0, 16).map((item) => ({
          id: item.id,
          priceType: item.priceType,
          amount: Number(item.amount),
          currency: item.currency,
          billingPeriod: item.billingPeriod,
          effectiveDate: item.effectiveDate?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString()
        })),
        evidenceSummary: detail.evidence.slice(0, 12).map((item) => ({
          id: item.id,
          sourceType: item.sourceType,
          sourceSubType: item.sourceSubType,
          confidenceScore: Number(item.confidenceScore),
          observedAt: item.observedAt.toISOString(),
          summaryLine: evidenceLine(item.signalSummary)
        })),
        lifecycleTimeline: detail.lifecycleEvents.slice(0, 20).map((item) => ({
          id: item.id,
          eventType: item.eventType,
          previousState: item.previousState,
          nextState: item.nextState,
          eventDate: item.eventDate?.toISOString() ?? item.createdAt.toISOString(),
          note: lifecycleNote(item.metadata)
        })),
        linkedObligations: detail.obligations.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          type: item.type,
          dueDate: item.dueDate?.toISOString() ?? null,
          amount: item.amount ? Number(item.amount) : null,
          currency: item.currency,
          updatedAt: item.updatedAt.toISOString()
        }))
      }
    };
  }
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

function buildWhatChanged(
  insights: Array<{ title: string; description: string; insightType: string }>,
  detail: {
    recurringPrice: import("@prisma/client").Prisma.Decimal | null;
    currency: string | null;
    nextRenewalDate: Date | null;
  }
) {
  if (insights[0]) {
    return insights[0].description || insights[0].title;
  }

  const priceLine =
    detail.recurringPrice !== null
      ? `Current recurring price is ${formatMoney(Number(detail.recurringPrice), detail.currency)}.`
      : "Recurring price is still being confirmed.";

  if (detail.nextRenewalDate) {
    return `${priceLine} Renewal date is ${detail.nextRenewalDate.toISOString().slice(0, 10)}.`;
  }

  return `${priceLine} New lifecycle signals were detected recently.`;
}

function buildWhyNow(
  daysToRenewal: number | null,
  insights: Array<{ insightType: string }>
) {
  if (daysToRenewal !== null && daysToRenewal >= 0 && daysToRenewal <= 7) {
    return `Renews in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}, so this decision is time-sensitive.`;
  }

  if (insights.some((item) => item.insightType === "PRICE_INCREASE")) {
    return "Price changed recently, so it is worth deciding before the next charge.";
  }

  if (
    insights.some(
      (item) =>
        item.insightType === "LOW_CONFIDENCE" ||
        item.insightType === "UNKNOWN_STATE" ||
        item.insightType === "PLAN_MISMATCH"
    )
  ) {
    return "Signals conflict or confidence is low, so a quick confirmation keeps future recommendations accurate.";
  }

  return "Recent lifecycle evidence makes this a good time for a quick keep/cancel/remind decision.";
}

function deriveRiskLevel(insights: Array<{ severity: SubscriptionInsightSeverity }>) {
  if (insights.some((item) => item.severity === SubscriptionInsightSeverity.HIGH)) {
    return "HIGH";
  }
  if (insights.some((item) => item.severity === SubscriptionInsightSeverity.MEDIUM)) {
    return "MEDIUM";
  }
  return "LOW";
}

function buildSourceSummary(
  evidence: Array<{
    sourceType: string;
    sourceSubType: string | null;
  }>
) {
  if (evidence.length === 0) {
    return "Detected from prior subscription and lifecycle activity.";
  }

  const hasGmail = evidence.some((item) => item.sourceType === "GMAIL");
  const hasRenewal = evidence.some((item) => item.sourceSubType === "RENEWAL_EMAIL");
  const hasReceipt = evidence.some((item) => item.sourceSubType === "RECEIPT_EMAIL");
  const hasCancellation = evidence.some((item) => item.sourceSubType === "CANCELLATION_EMAIL");

  if (hasGmail && hasRenewal && hasReceipt) {
    return "Detected from Gmail renewal and receipt emails.";
  }

  if (hasGmail && hasCancellation) {
    return "Detected from Gmail cancellation and lifecycle emails.";
  }

  if (hasGmail) {
    return "Detected from Gmail subscription lifecycle messages.";
  }

  return "Detected from trusted subscription lifecycle signals.";
}

function evidenceLine(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Subscription signal captured";
  }

  const record = value as Record<string, unknown>;
  if (typeof record.subject === "string" && record.subject.trim().length > 0) {
    return record.subject;
  }

  if (typeof record.lifecycleEmailType === "string") {
    return `Lifecycle signal: ${record.lifecycleEmailType.toLowerCase()}`;
  }

  return "Subscription signal captured";
}

function lifecycleNote(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.rationale === "string") return record.rationale;
  if (typeof record.reason === "string") return record.reason;
  return null;
}

function buildVisibilityReason(input: {
  scopeType: "PERSONAL" | "HOUSEHOLD";
  assigneeName: string | null;
  daysToRenewal: number | null;
  recommendationType: string;
}) {
  const reasonParts: string[] = [];

  if (input.scopeType === "HOUSEHOLD") {
    if (input.assigneeName) {
      reasonParts.push(`Household subscription assigned to ${input.assigneeName}`);
    } else {
      reasonParts.push("Household subscription currently unassigned");
    }
  } else {
    reasonParts.push("Personal subscription in your registry");
  }

  if (input.daysToRenewal !== null && input.daysToRenewal >= 0) {
    reasonParts.push(`renews in ${input.daysToRenewal} day${input.daysToRenewal === 1 ? "" : "s"}`);
  } else if (input.recommendationType === "REVIEW") {
    reasonParts.push("flagged for review by optimization signals");
  }

  return reasonParts.join(" because ");
}

function formatMoney(amount: number, currency: string | null) {
  return `${(currency ?? "USD").toUpperCase()} ${amount.toFixed(2)}`;
}
