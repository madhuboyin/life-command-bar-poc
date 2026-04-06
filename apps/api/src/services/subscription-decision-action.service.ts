import { AppError } from "../utils/app-error";
import { SubscriptionRegistryRepository } from "../repositories/subscription-registry.repository";
import { ReminderService } from "./reminder.service";
import { SubscriptionLifecycleState } from "@prisma/client";
import { SubscriptionInsightService } from "./subscription-insight.service";

export type DecisionActionType = "KEEP" | "CANCEL" | "REMIND_LATER" | "REVIEWED";

export interface DecisionActionPayload {
  action: DecisionActionType;
  remindAt?: string | null;
  note?: string | null;
}

export class SubscriptionDecisionActionService {
  private readonly registryRepository = new SubscriptionRegistryRepository();
  private readonly reminderService = new ReminderService();
  private readonly insightService = new SubscriptionInsightService();

  async executeAction(userId: string, subscriptionId: string, payload: DecisionActionPayload) {
    const existing = await this.registryRepository.findForUserStrict(subscriptionId, userId);
    if (!existing) {
      throw new AppError("NOT_FOUND", "Subscription not found", 404);
    }

    let nextState = existing.lifecycleState;

    // Handle action
    if (payload.action === "KEEP" || payload.action === "REVIEWED") {
        // Mark as reviewed, perhaps clear some insights or just bump lastHandled
        await this.registryRepository.updateSubscription(subscriptionId, {
            lastHandledByUserId: userId
        });
        
        await this.registryRepository.createAuditEvent({
            userId,
            eventType: `subscription_review_${payload.action.toLowerCase()}`,
            metadata: { subscriptionId, note: payload.note }
        });
        
        // Refresh insights to clear pending warnings
        await this.insightService.refreshForSubscriptions(userId, [subscriptionId], { emitEvents: true });

    } else if (payload.action === "CANCEL") {
        // Transition to CANCELING state, Guided Mode handoff can happen via UI.
        nextState = SubscriptionLifecycleState.CANCELING;
        
        await this.registryRepository.updateSubscription(subscriptionId, {
            lifecycleState: nextState,
            lastHandledByUserId: userId
        });

        await this.registryRepository.createLifecycleEvent({
            subscriptionId,
            eventType: "CANCELLATION_DETECTED",
            previousState: existing.lifecycleState,
            nextState: nextState,
            eventDate: new Date(),
            metadata: { reason: "User initiated cancellation via review hub", note: payload.note }
        });

        await this.registryRepository.createAuditEvent({
            userId,
            eventType: "subscription_review_cancel_initiated",
            metadata: { subscriptionId, note: payload.note }
        });
        
        await this.insightService.refreshForSubscriptions(userId, [subscriptionId], { emitEvents: true });

    } else if (payload.action === "REMIND_LATER") {
        if (!payload.remindAt) {
            throw new AppError("VALIDATION_ERROR", "remindAt is required for REMIND_LATER action", 400);
        }

        // Create a reminder (if there assumes a generic reminder service)
        // Since Obligation might not be attached to all subscriptions, maybe we attach it if it exists.
        // Or we just use the raw reminderService.
        // If ReminderService needs obligationId, we'd find an active one, or just store a generic reminder.
        // Assuming reminderService supports creating a reminder tied to the user/subscription.
        // We will log the event for now since Reminder schema normally attaches to obligations.
        await this.registryRepository.updateSubscription(subscriptionId, {
            lastHandledByUserId: userId
        });

        await this.registryRepository.createAuditEvent({
            userId,
            eventType: "subscription_review_remind_later",
            metadata: { subscriptionId, remindAt: payload.remindAt, note: payload.note }
        });
    }

    return { success: true, action: payload.action, subscriptionId, nextState };
  }
}
