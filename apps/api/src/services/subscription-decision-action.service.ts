import {
  ObligationSource,
  ObligationStatus,
  ObligationType,
  ScopeType
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { SubscriptionReviewRepository } from "../repositories/subscription-review.repository";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";
import { AppError } from "../utils/app-error";
import { SubscriptionDecisionEngine } from "./subscription-decision-engine";
import { GuidedJourneyService } from "./guided-journey.service";
import { SubscriptionInsightService } from "./subscription-insight.service";
import { SubscriptionReviewService } from "./subscription-review.service";

export class SubscriptionDecisionActionService {
  private readonly repository = new SubscriptionReviewRepository();
  private readonly decisionEngine = new SubscriptionDecisionEngine();
  private readonly guidedJourneyService = new GuidedJourneyService();
  private readonly insightService = new SubscriptionInsightService();
  private readonly reviewService = new SubscriptionReviewService();

  async keep(
    userId: string,
    subscriptionId: string,
    payload?: {
      note?: string | null;
      decisionDurationMs?: number;
    }
  ) {
    const subscription = await this.requireAccessibleSubscription(userId, subscriptionId);

    const result = await this.decisionEngine.applyDecision({
      userId,
      subscriptionId,
      decision: "KEEP",
      note: payload?.note ?? undefined
    });

    await createAuditEvent({
      userId,
      householdId: subscription.householdId,
      eventType: "subscription_review_keep_selected",
      metadata: {
        subscriptionId,
        decisionDurationMs: payload?.decisionDurationMs ?? null,
        note: payload?.note ?? null
      }
    });

    await createAuditEvent({
      userId,
      householdId: subscription.householdId,
      eventType: "subscription_review_completed",
      metadata: {
        subscriptionId,
        action: "KEEP",
        decisionDurationMs: payload?.decisionDurationMs ?? null
      }
    });

    const nextReviewSubscriptionId = await this.reviewService.getNextReviewSubscriptionId(
      userId,
      subscriptionId
    );

    return {
      action: "KEEP",
      result,
      nextReviewSubscriptionId
    };
  }

  async cancel(
    userId: string,
    subscriptionId: string,
    payload?: {
      note?: string | null;
      handoffToGuided?: boolean;
      decisionDurationMs?: number;
    }
  ) {
    const subscription = await this.requireAccessibleSubscription(userId, subscriptionId);

    const result = await this.decisionEngine.applyDecision({
      userId,
      subscriptionId,
      decision: "CANCEL",
      note: payload?.note ?? undefined
    });

    await createAuditEvent({
      userId,
      householdId: subscription.householdId,
      eventType: "subscription_review_cancel_selected",
      metadata: {
        subscriptionId,
        decisionDurationMs: payload?.decisionDurationMs ?? null,
        note: payload?.note ?? null
      }
    });

    const followUpObligationId = await this.ensureCancellationFollowUpObligation({
      userId,
      subscriptionId,
      title: subscription.subscriptionTitle,
      scopeType: subscription.scopeType,
      householdId: subscription.householdId
    });

    let guidedHandoff: {
      obligationId: string;
      journeyId: string;
    } | null = null;

    const shouldHandoff = payload?.handoffToGuided ?? true;
    if (shouldHandoff && followUpObligationId) {
      const journey = await this.guidedJourneyService
        .createOrResume(userId, followUpObligationId)
        .catch(() => null);

      if (journey?.journey) {
        guidedHandoff = {
          obligationId: followUpObligationId,
          journeyId: journey.journey.id
        };

        await createAuditEvent({
          userId,
          householdId: subscription.householdId,
          obligationId: followUpObligationId,
          eventType: "subscription_review_guided_flow_handoff",
          metadata: {
            subscriptionId,
            journeyId: journey.journey.id,
            obligationId: followUpObligationId
          }
        });
      }
    }

    await createAuditEvent({
      userId,
      householdId: subscription.householdId,
      obligationId: followUpObligationId,
      eventType: "subscription_review_completed",
      metadata: {
        subscriptionId,
        action: "CANCEL",
        decisionDurationMs: payload?.decisionDurationMs ?? null,
        guidedHandoff: Boolean(guidedHandoff)
      }
    });

    await this.insightService.refreshForSubscriptions(userId, [subscriptionId], {
      emitEvents: true
    });

    const nextReviewSubscriptionId = await this.reviewService.getNextReviewSubscriptionId(
      userId,
      subscriptionId
    );

    return {
      action: "CANCEL",
      result,
      followUpObligationId,
      guidedHandoff,
      nextReviewSubscriptionId
    };
  }

  async remindLater(
    userId: string,
    subscriptionId: string,
    payload?: {
      remindAt?: string | null;
      note?: string | null;
      decisionDurationMs?: number;
    }
  ) {
    const subscription = await this.requireAccessibleSubscription(userId, subscriptionId);

    const result = await this.decisionEngine.applyDecision({
      userId,
      subscriptionId,
      decision: "REMIND_LATER",
      remindAt: payload?.remindAt,
      note: payload?.note ?? undefined
    });

    await createAuditEvent({
      userId,
      householdId: subscription.householdId,
      eventType: "subscription_review_remind_selected",
      metadata: {
        subscriptionId,
        reminderId: result.reminderId,
        remindAt: payload?.remindAt ?? null,
        decisionDurationMs: payload?.decisionDurationMs ?? null
      }
    });

    await createAuditEvent({
      userId,
      householdId: subscription.householdId,
      eventType: "subscription_review_completed",
      metadata: {
        subscriptionId,
        action: "REMIND_LATER",
        reminderId: result.reminderId,
        decisionDurationMs: payload?.decisionDurationMs ?? null
      }
    });

    const nextReviewSubscriptionId = await this.reviewService.getNextReviewSubscriptionId(
      userId,
      subscriptionId
    );

    return {
      action: "REMIND_LATER",
      result,
      nextReviewSubscriptionId
    };
  }

  async markReviewed(
    userId: string,
    subscriptionId: string,
    payload?: {
      context?: "DETAILS_OPENED" | "COMPLETED";
      note?: string | null;
      decisionDurationMs?: number;
    }
  ) {
    const subscription = await this.requireAccessibleSubscription(userId, subscriptionId);

    await prisma.subscriptionRegistry.update({
      where: {
        id: subscriptionId
      },
      data: {
        lastHandledByUserId: userId
      }
    });

    const context = payload?.context ?? "COMPLETED";

    if (context === "DETAILS_OPENED") {
      await createAuditEvent({
        userId,
        householdId: subscription.householdId,
        eventType: "subscription_review_details_opened",
        metadata: {
          subscriptionId,
          note: payload?.note ?? null
        }
      });

      return {
        action: "REVIEW_DETAILS",
        nextReviewSubscriptionId: null
      };
    }

    await createAuditEvent({
      userId,
      householdId: subscription.householdId,
      eventType: "subscription_review_completed",
      metadata: {
        subscriptionId,
        action: "REVIEWED",
        decisionDurationMs: payload?.decisionDurationMs ?? null,
        note: payload?.note ?? null
      }
    });

    const nextReviewSubscriptionId = await this.reviewService.getNextReviewSubscriptionId(
      userId,
      subscriptionId
    );

    return {
      action: "REVIEWED",
      nextReviewSubscriptionId
    };
  }

  private async requireAccessibleSubscription(userId: string, subscriptionId: string) {
    const householdIds = await listActiveHouseholdIdsForUser(userId);
    const subscription = await this.repository.findDetailById({
      id: subscriptionId,
      userId,
      householdIds
    });

    if (!subscription) {
      throw new AppError("NOT_FOUND", "Subscription not found", 404);
    }

    return subscription;
  }

  private async ensureCancellationFollowUpObligation(input: {
    userId: string;
    subscriptionId: string;
    title: string;
    scopeType: ScopeType;
    householdId: string | null;
  }) {
    const existing = await prisma.obligation.findFirst({
      where: {
        userId: input.userId,
        subscriptionId: input.subscriptionId,
        status: {
          in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED, ObligationStatus.DRAFT]
        }
      },
      select: {
        id: true
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    if (existing?.id) return existing.id;

    const created = await prisma.obligation.create({
      data: {
        userId: input.userId,
        scopeType: input.scopeType,
        householdId: input.scopeType === ScopeType.HOUSEHOLD ? input.householdId : null,
        type: ObligationType.SUBSCRIPTION,
        source: ObligationSource.INFERRED,
        status: ObligationStatus.ACTIVE,
        title: `Complete cancellation for ${input.title}`,
        description: "Follow cancellation steps, confirm end date, and verify the final charge window.",
        subscriptionId: input.subscriptionId,
        confidenceScore: 0.78,
        urgencyScore: 74,
        importanceScore: 82
      }
    });

    await createAuditEvent({
      userId: input.userId,
      householdId: input.householdId,
      obligationId: created.id,
      eventType: "subscription_obligation_created",
      metadata: {
        subscriptionId: input.subscriptionId,
        obligationId: created.id,
        reason: "subscription_review_cancel_follow_up"
      }
    });

    return created.id;
  }
}
