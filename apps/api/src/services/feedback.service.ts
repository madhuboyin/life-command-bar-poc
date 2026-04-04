import { z } from "zod";
import { FeedbackRepository } from "../repositories/feedback.repository";
import { prisma } from "../clients/prisma.client";
import { AppError } from "../utils/app-error";
import { HomeMemoryService } from "./home-memory.service";

const feedbackSchema = z.object({
  userId: z.string().min(1),
  obligationId: z.string().optional(),
  feedItemId: z.string().optional(),
  type: z.enum([
    "ACCEPTED",
    "IGNORED",
    "MODIFIED",
    "COMPLETED",
    "POSTPONED",
    "REJECTED",
    "NOT_RELEVANT",
    "WRONG_INFO",
    "DONT_SHOW_AGAIN"
  ]),
  note: z.string().optional()
});

export class FeedbackService {
  private readonly repository = new FeedbackRepository();
  private readonly homeMemoryService = new HomeMemoryService();

  async create(payload: unknown) {
    const input = feedbackSchema.parse(payload);

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

    const created = await this.repository.create(input);

    await this.homeMemoryService
      .captureSignal({
        userId: input.userId,
        sourceType: "FEEDBACK",
        referenceId: input.obligationId ?? null,
        eventType: "feedback_event_created",
        metadata: {
          type: input.type,
          feedItemId: input.feedItemId ?? null
        },
        rebuild: true
      })
      .catch(() => null);

    return created;
  }
}
