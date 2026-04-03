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
}
