import { createAuditEvent } from "../observability/audit-event";
import { DailyCommandCenterRepository } from "../repositories/daily-command-center.repository";
import { AppError } from "../utils/app-error";
import { DailyPulseService } from "./daily-pulse.service";
import { DailyCommandCenterService } from "./daily-command-center.service";
import { ObligationActionsService } from "./obligation-actions.service";
import { PersonalizationSignalService } from "./personalization-signal.service";
import { BehaviorProfileService } from "./behavior-profile.service";
import { PersonalizationPolicyService } from "./personalization-policy.service";
import { AdaptivePersonalizationRolloutService } from "./adaptive-personalization-rollout.service";
import {
  UNKNOWN_BEHAVIOR_PROFILE,
  toBehaviorProfileView
} from "../types/personalization-policy.types";

export type TodayActionKey =
  | "MARK_DONE"
  | "REMIND_LATER"
  | "DISMISS"
  | "OPEN_GUIDED"
  | "REVIEW"
  | "REVIEW_SUBSCRIPTION"
  | "VIEW_DETAILS";

export class TodayActionLoopService {
  private readonly repository = new DailyCommandCenterRepository();
  private readonly obligations = new ObligationActionsService();
  private readonly pulseService = new DailyPulseService();
  private readonly todayService = new DailyCommandCenterService();
  private readonly personalizationSignalService = new PersonalizationSignalService();
  private readonly behaviorProfileService = new BehaviorProfileService();
  private readonly personalizationPolicyService = new PersonalizationPolicyService();
  private readonly rolloutService = new AdaptivePersonalizationRolloutService();

  async executeAction(
    userId: string,
    obligationId: string,
    payload: {
      actionKey: TodayActionKey;
      remindAt?: string | null;
      note?: string | null;
    }
  ) {
    const item = await this.repository.findByIdForUser(userId, obligationId);
    if (!item) {
      throw new AppError("NOT_FOUND", "Today item not found", 404);
    }

    let status: "COMPLETED" | "DEFERRED" | "DISMISSED" | "OPENED_GUIDED" | "ROUTED";
    let message: string;
    let targetHref: string | null = null;

    switch (payload.actionKey) {
      case "MARK_DONE": {
        const updated = await this.obligations.markDone(userId, obligationId, {
          note: payload.note ?? "Handled from Today View"
        }, {
          signalSource: "TODAY_VIEW"
        });
        if (!updated) {
          throw new AppError("NOT_FOUND", "Today item not found", 404);
        }

        await this.pulseService
          .markItemCompleted(userId, obligationId, "today_view_action")
          .catch(() => null);

        status = "COMPLETED";
        message = "Marked complete.";
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_item_completed",
          metadata: {
            actionKey: payload.actionKey,
            note: payload.note ?? null
          }
        });
        break;
      }
      case "REMIND_LATER": {
        const requestedRemindAt = parseOptionalIsoDate(payload.remindAt);
        const rolloutState = this.rolloutService.getUserRolloutState(userId);
        const reminderPolicyService = new PersonalizationPolicyService({
          flags: {
            enableRanking: false,
            enableMessaging: false,
            enableReminderTuning: rolloutState.reminderTuningEnabled
          }
        });

        let fallbackReason:
          | "ROLLOUT_DISABLED"
          | "PROFILE_FETCH_FAILED"
          | "POLICY_EVALUATION_FAILED"
          | null = null;
        let profile = UNKNOWN_BEHAVIOR_PROFILE;

        if (!rolloutState.reminderTuningEnabled) {
          fallbackReason = "ROLLOUT_DISABLED";
        } else {
          try {
            const behaviorProfile = await this.behaviorProfileService.getBehaviorProfile(userId);
            profile = toBehaviorProfileView(behaviorProfile);
          } catch {
            fallbackReason = "PROFILE_FETCH_FAILED";
          }
        }

        let reminderDecision:
          ReturnType<PersonalizationPolicyService["resolveTodayReminderSchedule"]>;
        try {
          reminderDecision = reminderPolicyService.resolveTodayReminderSchedule({
            profile,
            dueDate: item.dueDate?.toISOString() ?? null,
            renewalDate: item.subscription?.nextRenewalDate?.toISOString() ?? null,
            requestedRemindAt
          });
        } catch {
          fallbackReason = "POLICY_EVALUATION_FAILED";
          reminderDecision = this.personalizationPolicyService.resolveTodayReminderSchedule({
            profile: UNKNOWN_BEHAVIOR_PROFILE,
            dueDate: item.dueDate?.toISOString() ?? null,
            renewalDate: item.subscription?.nextRenewalDate?.toISOString() ?? null,
            requestedRemindAt
          });
        }
        const until = reminderDecision.remindAt.toISOString();
        const updated = await this.obligations.postpone(userId, obligationId, {
          until,
          reason: payload.note ?? "Deferred from Today View"
        }, {
          signalSource: "TODAY_VIEW"
        });
        if (!updated) {
          throw new AppError("NOT_FOUND", "Today item not found", 404);
        }

        await this.pulseService
          .markItemPostponed(userId, obligationId, "today_view_action")
          .catch(() => null);

        status = "DEFERRED";
        message =
          reminderDecision.reminderStyle === "SHORT_FOLLOWUP"
            ? "Reminder set for a near follow-up."
            : reminderDecision.reminderStyle === "REALISTIC_FOLLOWUP"
              ? "Reminder set for a realistic follow-up."
              : "Reminder moved later.";
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_item_deferred",
          metadata: {
            actionKey: payload.actionKey,
            remindAt: until,
            note: payload.note ?? null,
            reminderStyle: reminderDecision.reminderStyle,
            reminderReason: reminderDecision.reason
          }
        });
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "reminder_style_applied",
          metadata: {
            surface: "TODAY_VIEW",
            reminderStyle: reminderDecision.reminderStyle,
            reason: reminderDecision.reason,
            usedPersonalizedDefault: reminderDecision.usedPersonalizedDefault,
            remindAt: until
          }
        });
        if (fallbackReason) {
          await createAuditEvent({
            userId,
            householdId: item.householdId,
            obligationId,
            eventType: "personalization_fallback_used",
            metadata: {
              surface: "TODAY_REMINDER",
              reason: fallbackReason,
              rolloutReason: rolloutState.reason
            }
          });
        }
        if (
          fallbackReason === "PROFILE_FETCH_FAILED" ||
          fallbackReason === "POLICY_EVALUATION_FAILED"
        ) {
          await createAuditEvent({
            userId,
            householdId: item.householdId,
            obligationId,
            eventType: "personalization_error_recovered",
            metadata: {
              surface: "TODAY_REMINDER",
              layer:
                fallbackReason === "PROFILE_FETCH_FAILED"
                  ? "PROFILE_FETCH"
                  : "POLICY_EVALUATION",
              recovery: "BASELINE_FALLBACK"
            }
          });
        }
        break;
      }
      case "DISMISS": {
        const updated = await this.obligations.dismiss(userId, obligationId, {
          reason: payload.note ?? "Dismissed from Today View"
        });
        if (!updated) {
          throw new AppError("NOT_FOUND", "Today item not found", 404);
        }

        await this.pulseService
          .markItemDismissed(userId, obligationId, "today_view_action")
          .catch(() => null);

        status = "DISMISSED";
        message = "Dismissed for now.";
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_item_completed",
          metadata: {
            actionKey: payload.actionKey,
            note: payload.note ?? null,
            dismissal: true
          }
        });
        break;
      }
      case "OPEN_GUIDED": {
        await this.recordBehaviorSignals(userId, [
          {
            userId,
            signalType: "DETAIL_OPENED",
            obligationId,
            itemId: obligationId,
            category: "OBLIGATION",
            source: "TODAY_VIEW"
          },
          {
            userId,
            signalType: "REVIEW_STARTED",
            obligationId,
            itemId: obligationId,
            category: "OBLIGATION",
            source: "TODAY_VIEW"
          }
        ]);

        await this.pulseService
          .markItemOpenedGuided(userId, obligationId, "today_view_action")
          .catch(() => null);

        status = "OPENED_GUIDED";
        message = "Opening guided flow.";
        targetHref = `/obligations/${obligationId}`;

        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_guided_flow_started",
          metadata: {
            actionKey: payload.actionKey
          }
        });
        break;
      }
      case "REVIEW": {
        await this.recordBehaviorSignals(userId, [
          {
            userId,
            signalType: "DETAIL_OPENED",
            obligationId,
            itemId: obligationId,
            category: "OBLIGATION",
            source: "TODAY_VIEW"
          },
          {
            userId,
            signalType: "REVIEW_STARTED",
            obligationId,
            itemId: obligationId,
            category: "OBLIGATION",
            source: "TODAY_VIEW"
          }
        ]);

        status = "ROUTED";
        message = "Opening review details.";
        targetHref = `/obligations/${obligationId}/review`;
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_primary_item_opened",
          metadata: {
            actionKey: payload.actionKey
          }
        });
        break;
      }
      case "REVIEW_SUBSCRIPTION": {
        await this.recordBehaviorSignals(userId, [
          {
            userId,
            signalType: "DETAIL_OPENED",
            obligationId,
            itemId: item.subscriptionId ?? obligationId,
            category: "SUBSCRIPTION",
            source: "TODAY_VIEW",
            metadata: {
              subscriptionId: item.subscriptionId ?? null
            }
          },
          {
            userId,
            signalType: "REVIEW_STARTED",
            obligationId,
            itemId: item.subscriptionId ?? obligationId,
            category: "SUBSCRIPTION",
            source: "TODAY_VIEW",
            metadata: {
              subscriptionId: item.subscriptionId ?? null
            }
          }
        ]);

        status = "ROUTED";
        message = "Opening subscription review.";
        targetHref = item.subscriptionId ? `/subscriptions/review/${item.subscriptionId}` : "/subscriptions/review";
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_primary_item_opened",
          metadata: {
            actionKey: payload.actionKey,
            subscriptionId: item.subscriptionId
          }
        });
        break;
      }
      case "VIEW_DETAILS":
      default: {
        await this.recordBehaviorSignals(userId, [
          {
            userId,
            signalType: "DETAIL_OPENED",
            obligationId,
            itemId: obligationId,
            category: "OBLIGATION",
            source: "TODAY_VIEW"
          }
        ]);

        status = "ROUTED";
        message = "Opening item details.";
        targetHref = `/obligations/${obligationId}`;
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_primary_item_opened",
          metadata: {
            actionKey: payload.actionKey
          }
        });
      }
    }

    await createAuditEvent({
      userId,
      householdId: item.householdId,
      obligationId,
      eventType: "today_primary_action_taken",
      metadata: {
        actionKey: payload.actionKey,
        status,
        note: payload.note ?? null,
        remindAt: payload.remindAt ?? null
      }
    });

    const today = await this.todayService.getTodayView(userId, {
      emitEvents: false
    });

    if (today.primaryItems.length === 0) {
      await createAuditEvent({
        userId,
        householdId: item.householdId,
        eventType: "today_done_for_now_reached",
        metadata: {
          reason: "action_completed_all_primary"
        }
      });
    }

    return {
      actionKey: payload.actionKey,
      status,
      message,
      targetHref,
      nextPrimaryItemId: today.primaryItems[0]?.id ?? null,
      today
    };
  }

  private async recordBehaviorSignals(
    userId: string,
    signals: Parameters<PersonalizationSignalService["recordSignals"]>[0]
  ) {
    await this.personalizationSignalService.recordSignals(signals).catch(() => null);
    void this.behaviorProfileService.recomputeBehaviorProfile(userId).catch(() => null);
  }
}

function parseOptionalIsoDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
