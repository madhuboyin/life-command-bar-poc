import { z } from "zod";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";

const postponeSchema = z.object({
  until: z.string().datetime().optional(),
  reason: z.string().optional()
});

const dismissSchema = z.object({
  reason: z.string().optional()
});

const markDoneSchema = z.object({
  note: z.string().optional()
});

export class ObligationActionsService {
  private readonly repository = new ObligationRepository();

  async markDone(userId: string, obligationId: string, payload: unknown) {
    const input = markDoneSchema.parse(payload);
    const obligation = await this.repository.markDone(obligationId, userId, input.note);
    return obligation ? mapObligation(obligation) : null;
  }

  async dismiss(userId: string, obligationId: string, payload: unknown) {
    const input = dismissSchema.parse(payload);
    const obligation = await this.repository.dismiss(obligationId, userId, input.reason);
    return obligation ? mapObligation(obligation) : null;
  }

  async postpone(userId: string, obligationId: string, payload: unknown) {
    const input = postponeSchema.parse(payload);
    const obligation = await this.repository.postpone(
      obligationId,
      userId,
      input.until,
      input.reason
    );
    return obligation ? mapObligation(obligation) : null;
  }
}
