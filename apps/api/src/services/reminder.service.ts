import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import { AppError } from "../utils/app-error";

const createReminderSchema = z.object({
  userId: z.string().min(1),
  obligationId: z.string().optional(),
  title: z.string().min(1),
  scheduledFor: z.string().datetime()
});

export class ReminderService {
  async create(payload: unknown) {
    const input = createReminderSchema.parse(payload);

    if (input.obligationId) {
      const obligation = await prisma.obligation.findFirst({
        where: {
          id: input.obligationId,
          userId: input.userId
        },
        select: { id: true }
      });

      if (!obligation) {
        throw new AppError("NOT_FOUND", "Obligation not found", 404);
      }
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId,
        title: input.title,
        scheduledFor: new Date(input.scheduledFor),
        status: "SCHEDULED"
      }
    });

    await prisma.auditEvent.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId,
        eventType: "reminder_created",
        metadata: {
          reminderId: reminder.id,
          scheduledFor: input.scheduledFor
        }
      }
    });

    return reminder;
  }

  async list(userId: string) {
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
