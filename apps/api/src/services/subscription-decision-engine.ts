import {
  ObligationSource,
  ObligationStatus,
  ObligationType,
  ScopeType,
  SubscriptionAutoRenewStatus,
  SubscriptionLifecycleEventType,
  SubscriptionLifecycleState,
  SubscriptionRecommendationType
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { ReminderService } from "./reminder.service";
import { SubscriptionInsightService } from "./subscription-insight.service";
import type { SubscriptionFlowDecision } from "./subscription-guided-flow";
import { AppError } from "../utils/app-error";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";
import { BehaviorProfileService } from "./behavior-profile.service";
import { PersonalizationPolicyService } from "./personalization-policy.service";
import { toBehaviorProfileView } from "../types/personalization-policy.types";

export class SubscriptionDecisionEngine {
  private readonly reminderService = new ReminderService();
  private readonly insightService = new SubscriptionInsightService();
  private readonly behaviorProfileService = new BehaviorProfileService();
  private readonly personalizationPolicyService = new PersonalizationPolicyService();

  async applyDecision(input: {
    userId: string;
    subscriptionId: string;
    decision: SubscriptionFlowDecision;
    remindAt?: string | null;
    note?: string | null;
  }) {
    const householdIds = await listActiveHouseholdIdsForUser(input.userId);
    const subscription = await prisma.subscriptionRegistry.findFirst({
      where: {
        id: input.subscriptionId,
        OR: [
          {
            userId: input.userId,
            scopeType: ScopeType.PERSONAL
          },
          ...(householdIds.length > 0
            ? [
                {
                  scopeType: ScopeType.HOUSEHOLD,
                  householdId: {
                    in: householdIds
                  }
                }
              ]
            : [])
        ]
      },
      include: {
        recommendation: true,
        obligations: {
          where: {
            status: {
              in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED, ObligationStatus.DRAFT]
            }
          },
          select: {
            id: true
          },
          take: 1
        }
      }
    });

    if (!subscription) {
      throw new AppError("NOT_FOUND", "Subscription not found", 404);
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      lastHandledByUserId: input.userId
    };
    let lifecycleEventType: SubscriptionLifecycleEventType | null = null;
    let reminderCreatedId: string | null = null;
    let reminderDecision: ReturnType<
      PersonalizationPolicyService["resolveSubscriptionReminderSchedule"]
    > | null = null;
    let createdObligationId: string | null = null;

    if (input.decision === "KEEP") {
      if (
        subscription.lifecycleState === SubscriptionLifecycleState.DISCOVERED ||
        subscription.lifecycleState === SubscriptionLifecycleState.UNKNOWN
      ) {
        updateData.lifecycleState = SubscriptionLifecycleState.ACTIVE;
        lifecycleEventType = SubscriptionLifecycleEventType.ACTIVATED;
      }
    }

    if (input.decision === "CANCEL") {
      updateData.lifecycleState = SubscriptionLifecycleState.CANCELING;
      updateData.autoRenewStatus = SubscriptionAutoRenewStatus.OFF;
      lifecycleEventType = SubscriptionLifecycleEventType.CANCELLATION_DETECTED;
    }

    if (input.decision === "DOWNGRADE") {
      createdObligationId = await this.createDowngradeObligation({
        userId: input.userId,
        subscriptionId: subscription.id,
        title: `Review downgrade options for ${subscription.subscriptionTitle}`,
        scopeType: subscription.scopeType,
        householdId: subscription.householdId
      });
    }

    if (input.decision === "REVIEW") {
      createdObligationId = await this.createDowngradeObligation({
        userId: input.userId,
        subscriptionId: subscription.id,
        title: `Review ${subscription.subscriptionTitle} details`,
        scopeType: subscription.scopeType,
        householdId: subscription.householdId
      });
    }

    if (input.decision === "REMIND_LATER") {
      const requestedRemindAt = parseReminderDate(input.remindAt);
      const behaviorProfile = await this.behaviorProfileService
        .getBehaviorProfile(input.userId)
        .catch(() => null);
      reminderDecision =
        this.personalizationPolicyService.resolveSubscriptionReminderSchedule({
          profile: toBehaviorProfileView(behaviorProfile),
          nextRenewalDate: subscription.nextRenewalDate?.toISOString() ?? null,
          requestedRemindAt
        });
      const reminder = await this.reminderService.create({
        userId: input.userId,
        obligationId: subscription.obligations[0]?.id,
        title: `Review subscription: ${subscription.subscriptionTitle}`,
        scheduledFor: reminderDecision.remindAt.toISOString()
      });
      reminderCreatedId = reminder.id;

      await createAuditEvent({
        userId: input.userId,
        eventType: "reminder_style_applied",
        metadata: {
          surface: "SUBSCRIPTION_REVIEW",
          subscriptionId: subscription.id,
          reminderStyle: reminderDecision.reminderStyle,
          reason: reminderDecision.reason,
          usedPersonalizedDefault: reminderDecision.usedPersonalizedDefault,
          remindAt: reminderDecision.remindAt.toISOString()
        }
      });
    }

    const normalizedRecommendation = normalizeDecisionToRecommendation(input.decision);

    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.subscriptionRegistry.update({
          where: {
            id: subscription.id
          },
          data: updateData
        });
      }

      if (lifecycleEventType) {
        await tx.subscriptionLifecycleEvent.create({
          data: {
            subscriptionId: subscription.id,
            eventType: lifecycleEventType,
            previousState: subscription.lifecycleState,
            nextState:
              typeof updateData.lifecycleState === "string"
                ? (updateData.lifecycleState as SubscriptionLifecycleState)
                : subscription.lifecycleState,
            eventDate: now,
            metadata: {
              decision: input.decision
            }
          }
        });
      }

      await tx.subscriptionRecommendation.upsert({
        where: {
          subscriptionId: subscription.id
        },
        create: {
          userId: input.userId,
          subscriptionId: subscription.id,
          recommendationType: normalizedRecommendation,
          reason: decisionReason(input.decision),
          confidenceScore: recommendationConfidence(input.decision),
          supportingInsights: subscription.recommendation?.supportingInsights ?? []
        },
        update: {
          recommendationType: normalizedRecommendation,
          reason: decisionReason(input.decision),
          confidenceScore: recommendationConfidence(input.decision),
          supportingInsights: subscription.recommendation?.supportingInsights ?? []
        }
      });
    });

    await createAuditEvent({
      userId: input.userId,
      eventType: "subscription_decision_taken",
      metadata: {
        subscriptionId: subscription.id,
        decision: input.decision,
        recommendationType: normalizedRecommendation,
        reminderId: reminderCreatedId,
        reminderStyle: reminderDecision?.reminderStyle ?? null,
        reminderReason: reminderDecision?.reason ?? null,
        createdObligationId,
        note: input.note ?? null
      }
    });

    if (input.decision === "KEEP") {
      await createAuditEvent({
        userId: input.userId,
        eventType: "subscription_kept",
        metadata: {
          subscriptionId: subscription.id
        }
      });
    }

    if (input.decision === "CANCEL") {
      await createAuditEvent({
        userId: input.userId,
        eventType: "subscription_marked_for_cancel",
        metadata: {
          subscriptionId: subscription.id
        }
      });
    }

    await this.insightService.refreshForSubscriptions(input.userId, [subscription.id], {
      emitEvents: true
    });

    return {
      subscriptionId: subscription.id,
      decision: input.decision,
      recommendationType: normalizedRecommendation,
      reminderId: reminderCreatedId,
      createdObligationId
    };
  }

  private async createDowngradeObligation(input: {
    userId: string;
    subscriptionId: string;
    title: string;
    scopeType: ScopeType;
    householdId: string | null;
  }) {
    const obligation = await prisma.obligation.create({
      data: {
        userId: input.userId,
        scopeType: input.scopeType,
        householdId: input.householdId,
        type: ObligationType.SUBSCRIPTION,
        title: input.title,
        source: ObligationSource.INFERRED,
        status: ObligationStatus.ACTIVE,
        confidenceScore: 0.72,
        urgencyScore: 48,
        importanceScore: 62,
        subscriptionId: input.subscriptionId
      }
    });

    await createAuditEvent({
      userId: input.userId,
      obligationId: obligation.id,
      eventType: "subscription_obligation_created",
      metadata: {
        subscriptionId: input.subscriptionId,
        obligationId: obligation.id,
        reason: "subscription_decision_flow"
      }
    });

    return obligation.id;
  }
}

function parseReminderDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid reminder date", 400);
  }
  return parsed;
}

function normalizeDecisionToRecommendation(decision: SubscriptionFlowDecision) {
  if (decision === "KEEP") return SubscriptionRecommendationType.KEEP;
  if (decision === "CANCEL") return SubscriptionRecommendationType.CANCEL;
  if (decision === "DOWNGRADE") return SubscriptionRecommendationType.DOWNGRADE;
  if (decision === "REMIND_LATER") return SubscriptionRecommendationType.REVIEW;
  return SubscriptionRecommendationType.REVIEW;
}

function decisionReason(decision: SubscriptionFlowDecision) {
  if (decision === "KEEP") return "User confirmed subscription should stay active.";
  if (decision === "CANCEL") return "User marked subscription for cancellation.";
  if (decision === "DOWNGRADE") return "User selected downgrade path.";
  if (decision === "REMIND_LATER") return "User chose to revisit later with reminder.";
  return "User requested manual review.";
}

function recommendationConfidence(decision: SubscriptionFlowDecision) {
  if (decision === "KEEP") return 0.84;
  if (decision === "CANCEL") return 0.86;
  if (decision === "DOWNGRADE") return 0.78;
  if (decision === "REMIND_LATER") return 0.64;
  return 0.68;
}
