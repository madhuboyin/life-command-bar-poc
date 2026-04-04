import { z } from "zod";
import { AutoFlowTriggerType } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { AppError } from "../utils/app-error";
import { AutoFlowService } from "./auto-flow.service";
import { ObligationRepository } from "../repositories/obligation.repository";

const createReminderSchema = z.object({
  userId: z.string().min(1),
  obligationId: z.string().optional(),
  title: z.string().min(1),
  scheduledFor: z.string().datetime()
});

export class ReminderService {
  private readonly autoFlowService = new AutoFlowService();
  private readonly obligationRepository = new ObligationRepository();

  async create(payload: unknown) {
    const input = createReminderSchema.parse(payload);
    let linkedObligation: Awaited<
      ReturnType<ObligationRepository["findById"]>
    > | null = null;

    if (input.obligationId) {
      linkedObligation = await this.obligationRepository.findById(
        input.obligationId,
        input.userId
      );

      if (!linkedObligation) {
        throw new AppError("NOT_FOUND", "Obligation not found", 404);
      }
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId: input.userId,
        scopeType: linkedObligation?.scopeType ?? "PERSONAL",
        householdId: linkedObligation?.householdId ?? null,
        obligationId: input.obligationId,
        title: input.title,
        scheduledFor: new Date(input.scheduledFor),
        status: "SCHEDULED"
      }
    });

    await createAuditEvent({
      userId: input.userId,
      householdId: linkedObligation?.householdId ?? null,
      obligationId: input.obligationId,
      eventType: "reminder_created",
      metadata: {
        reminderId: reminder.id,
        scheduledFor: input.scheduledFor
      }
    });

    const scheduledFor = new Date(input.scheduledFor);
    if (
      input.obligationId &&
      scheduledFor.getTime() - Date.now() <= 60 * 60 * 1000
    ) {
      await this.autoFlowService.triggerForEvent({
        userId: input.userId,
        obligationId: input.obligationId,
        triggerType: AutoFlowTriggerType.REMINDER_TRIGGER,
        source: "reminder_created_near_due",
        reasonHint: "Reminder is due soon"
      });
    }

    return reminder;
  }

  async list(userId: string) {
    await this.autoFlowService.processDueReminderTriggers(userId);

    const items = await prisma.reminder.findMany({
      where: { userId },
      orderBy: { scheduledFor: "asc" }
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        obligationId: item.obligationId,
        title: item.title,
        scheduledFor: item.scheduledFor.toISOString(),
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      }))
    };
  }
}
