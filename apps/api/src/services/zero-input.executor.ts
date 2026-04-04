import { AutoFlowTriggerType, ObligationStatus, ZeroInputActionType } from "@prisma/client";
import { AutoFlowService } from "./auto-flow.service";
import { PredictionEngineService } from "./prediction-engine.service";
import { ZeroInputRepository } from "../repositories/zero-input.repository";
import type { ZeroInputPolicyPayload } from "./zero-input.policy";

export class ZeroInputExecutor {
  private readonly repository = new ZeroInputRepository();
  private readonly autoFlowService = new AutoFlowService();
  private readonly predictionEngineService = new PredictionEngineService();

  async execute(input: {
    userId: string;
    action: ZeroInputActionType;
    obligationId?: string | null;
    predictionId?: string | null;
    title?: string | null;
    dueDate?: Date | null;
    scheduledFor?: Date | null;
    policy: ZeroInputPolicyPayload;
    reason: string;
  }) {
    if (input.action === ZeroInputActionType.CREATE_DRAFT_FROM_INGESTION) {
      if (!input.obligationId) return { executed: false as const };
      const updated = await this.repository.updateObligationForUser({
        userId: input.userId,
        obligationId: input.obligationId,
        data: {
          status: ObligationStatus.ACTIVE,
          lastActedAt: new Date()
        }
      });
      return {
        executed: Boolean(updated),
        obligationId: updated?.id ?? input.obligationId
      };
    }

    if (input.action === ZeroInputActionType.PROMOTE_RECURRING_PREDICTION) {
      if (!input.predictionId) return { executed: false as const };
      const promoted = await this.predictionEngineService.confirm(input.userId, input.predictionId, {
        promote: true
      });
      const promotedObligation = promoted?.promotedObligation;
      if (!promotedObligation) {
        return { executed: false as const };
      }

      if (input.policy.requireApprovalForFinancialItems && (promotedObligation.amount ?? 0) > 0) {
        const draft = await this.repository.updateObligationForUser({
          userId: input.userId,
          obligationId: promotedObligation.id,
          data: {
            status: ObligationStatus.DRAFT
          }
        });
        return {
          executed: Boolean(draft),
          obligationId: promotedObligation.id
        };
      }

      return {
        executed: true as const,
        obligationId: promotedObligation.id
      };
    }

    if (input.action === ZeroInputActionType.AUTO_CREATE_REMINDER) {
      const scheduledFor = this.resolveReminderTime({
        policy: input.policy,
        dueDate: input.dueDate ?? null,
        explicitDate: input.scheduledFor ?? null
      });

      const existing = await this.repository.findExistingUpcomingReminder({
        userId: input.userId,
        obligationId: input.obligationId ?? null,
        title: input.title ?? null,
        windowStart: new Date(scheduledFor.getTime() - 90 * 60 * 1000),
        windowEnd: new Date(scheduledFor.getTime() + 90 * 60 * 1000)
      });
      if (existing) {
        return {
          executed: false as const,
          reminderId: existing.id
        };
      }

      const reminder = await this.repository.createReminder({
        userId: input.userId,
        obligationId: input.obligationId ?? null,
        title: input.title ?? "Upcoming item reminder",
        scheduledFor
      });

      return {
        executed: true as const,
        reminderId: reminder.id
      };
    }

    if (input.action === ZeroInputActionType.PREPARE_AUTO_FLOW) {
      if (!input.obligationId) return { executed: false as const };
      const created = await this.autoFlowService.triggerForEvent({
        userId: input.userId,
        obligationId: input.obligationId,
        triggerType: AutoFlowTriggerType.PATTERN_TRIGGER,
        source: "zero_input_prepare",
        reasonHint: input.reason
      });

      return {
        executed: Boolean(created),
        autoFlowId: created?.id ?? null
      };
    }

    if (input.action === ZeroInputActionType.SUPPRESS_DUPLICATE) {
      return {
        executed: true as const
      };
    }

    return {
      executed: false as const
    };
  }

  async undo(input: {
    userId: string;
    action: ZeroInputActionType;
    obligationId?: string | null;
    reminderId?: string | null;
    reason?: string | null;
  }) {
    if (input.action === ZeroInputActionType.AUTO_CREATE_REMINDER && input.reminderId) {
      const reminder = await this.repository.updateReminder(input.reminderId, {
        status: "CANCELLED"
      });
      return { undone: Boolean(reminder), reminderId: reminder.id };
    }

    if (
      (input.action === ZeroInputActionType.CREATE_DRAFT_FROM_INGESTION ||
        input.action === ZeroInputActionType.PROMOTE_RECURRING_PREDICTION) &&
      input.obligationId
    ) {
      const obligation = await this.repository.updateObligationForUser({
        userId: input.userId,
        obligationId: input.obligationId,
        data: {
          status: ObligationStatus.DRAFT
        }
      });
      return {
        undone: Boolean(obligation),
        obligationId: obligation?.id ?? input.obligationId
      };
    }

    return { undone: false };
  }

  private resolveReminderTime(input: {
    policy: ZeroInputPolicyPayload;
    dueDate: Date | null;
    explicitDate: Date | null;
  }) {
    let candidate =
      input.explicitDate ??
      (input.dueDate ? new Date(input.dueDate.getTime() - 24 * 60 * 60 * 1000) : null) ??
      new Date(Date.now() + 2 * 60 * 60 * 1000);

    if (candidate.getTime() < Date.now() + 15 * 60 * 1000) {
      candidate = new Date(Date.now() + 15 * 60 * 1000);
    }

    const quietAdjusted = applyQuietHours(
      candidate,
      input.policy.quietHoursStart,
      input.policy.quietHoursEnd
    );

    return quietAdjusted;
  }
}

function applyQuietHours(date: Date, quietStart: string | null, quietEnd: string | null) {
  if (!quietStart || !quietEnd) return date;

  const [startHour, startMinute] = quietStart.split(":").map((value) => Number(value));
  const [endHour, endMinute] = quietEnd.split(":").map((value) => Number(value));
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return date;
  }

  const candidateMinutes = date.getHours() * 60 + date.getMinutes();
  const quietStartMinutes = startHour * 60 + startMinute;
  const quietEndMinutes = endHour * 60 + endMinute;

  const wrapsMidnight = quietStartMinutes > quietEndMinutes;
  const inQuietHours = wrapsMidnight
    ? candidateMinutes >= quietStartMinutes || candidateMinutes <= quietEndMinutes
    : candidateMinutes >= quietStartMinutes && candidateMinutes <= quietEndMinutes;

  if (!inQuietHours) return date;

  const adjusted = new Date(date);
  adjusted.setHours(endHour, endMinute, 0, 0);

  if (!wrapsMidnight && candidateMinutes <= quietEndMinutes) {
    return adjusted;
  }

  if (wrapsMidnight) {
    if (candidateMinutes >= quietStartMinutes) {
      adjusted.setDate(adjusted.getDate() + 1);
    }
    return adjusted;
  }

  adjusted.setDate(adjusted.getDate() + 1);
  return adjusted;
}
