import { FeedbackType } from "@prisma/client";
import { prisma } from "../clients/prisma.client";

export class FeedbackRepository {
  async getRecentFeedbackMap(userId: string) {
    const feedback = await prisma.feedbackEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    const byObligationId = new Map<string, FeedbackType[]>();

    for (const item of feedback) {
      if (!item.obligationId) continue;
      const existing = byObligationId.get(item.obligationId) ?? [];
      existing.push(item.type);
      byObligationId.set(item.obligationId, existing);
    }

    return byObligationId;
  }

  async create(input: {
    userId: string;
    obligationId?: string;
    feedItemId?: string;
    type:
      | "ACCEPTED"
      | "IGNORED"
      | "MODIFIED"
      | "COMPLETED"
      | "POSTPONED"
      | "REJECTED"
      | "NOT_RELEVANT"
      | "WRONG_INFO"
      | "DONT_SHOW_AGAIN";
    note?: string;
  }) {
    return prisma.feedbackEvent.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId,
        feedItemId: input.feedItemId,
        type: input.type,
        note: input.note
      }
    });
  }
}
