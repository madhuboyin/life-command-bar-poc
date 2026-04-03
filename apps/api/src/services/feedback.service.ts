import { z } from "zod";
import { FeedbackRepository } from "../repositories/feedback.repository";

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

  async create(payload: unknown) {
    const input = feedbackSchema.parse(payload);
    return this.repository.create(input);
  }
}
