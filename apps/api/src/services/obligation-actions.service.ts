import { z } from "zod";
import { AutoFlowTriggerType } from "@prisma/client";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { AutoFlowService } from "./auto-flow.service";

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
  private readonly autoFlowService = new AutoFlowService();

  async markDone(userId: string, obligationId: string, payload: unknown) {
    const input = markDoneSchema.parse(payload);
    const obligation = await this.repository.markDone(obligationId, userId, input.note);
    if (!obligation) return null;

    const mapped = mapObligation(obligation);
    await this.autoFlowService.handleObligationStatusChange(userId, obligationId, mapped.status);
    await this.autoFlowService.triggerFromRelatedAction({
      userId,
      completedObligationId: obligationId,
      completedObligationType: mapped.type
    });

    return mapped;
  }

  async dismiss(userId: string, obligationId: string, payload: unknown) {
    const input = dismissSchema.parse(payload);
    const obligation = await this.repository.dismiss(obligationId, userId, input.reason);
    if (!obligation) return null;

    const mapped = mapObligation(obligation);
    await this.autoFlowService.handleObligationStatusChange(userId, obligationId, mapped.status);
    return mapped;
  }

  async postpone(userId: string, obligationId: string, payload: unknown) {
    const input = postponeSchema.parse(payload);
    const obligation = await this.repository.postpone(
      obligationId,
      userId,
      input.until,
      input.reason
    );
    if (!obligation) return null;

    const mapped = mapObligation(obligation);
    await this.autoFlowService.handleObligationStatusChange(userId, obligationId, mapped.status);
    await this.autoFlowService.triggerForEvent({
      userId,
      obligationId,
      triggerType: AutoFlowTriggerType.URGENCY_TRIGGER,
      source: "postpone_action",
      reasonHint: "Postponed item may need follow-up"
    });
    return mapped;
  }
}
