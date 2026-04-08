import { createAuditEvent } from "../observability/audit-event";
import { DailyCommandCenterRepository } from "../repositories/daily-command-center.repository";
import { AppError } from "../utils/app-error";
import { DailyPulseService } from "./daily-pulse.service";
import { DailyCommandCenterService } from "./daily-command-center.service";
import { ObligationActionsService } from "./obligation-actions.service";

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
        const until = payload.remindAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const updated = await this.obligations.postpone(userId, obligationId, {
          until,
          reason: payload.note ?? "Deferred from Today View"
        });
        if (!updated) {
          throw new AppError("NOT_FOUND", "Today item not found", 404);
        }

        await this.pulseService
          .markItemPostponed(userId, obligationId, "today_view_action")
          .catch(() => null);

        status = "DEFERRED";
        message = "Reminder moved later.";
        await createAuditEvent({
          userId,
          householdId: item.householdId,
          obligationId,
          eventType: "today_item_deferred",
          metadata: {
            actionKey: payload.actionKey,
            remindAt: until,
            note: payload.note ?? null
          }
        });
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
}
