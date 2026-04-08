import { z } from "zod";
import { AutoFlowTriggerType } from "@prisma/client";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { AutoFlowService } from "./auto-flow.service";
import { HomeMemoryService } from "./home-memory.service";
import { PersonalizationSignalService } from "./personalization-signal.service";
import { BehaviorProfileService } from "./behavior-profile.service";

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
  private readonly homeMemoryService = new HomeMemoryService();
  private readonly personalizationSignalService = new PersonalizationSignalService();
  private readonly behaviorProfileService = new BehaviorProfileService();

  async markDone(
    userId: string,
    obligationId: string,
    payload: unknown,
    options?: {
      signalSource?: "TODAY_VIEW" | "DAILY_PULSE" | "OBLIGATION_ACTION";
      decisionDurationMs?: number | null;
    }
  ) {
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
    await this.captureMemorySignal(userId, obligationId, "obligation_marked_done");
    await this.captureBehaviorSignals(userId, [
      {
        userId,
        signalType: "ITEM_ACTED",
        obligationId,
        itemId: obligationId,
        category: "OBLIGATION",
        source: options?.signalSource ?? "OBLIGATION_ACTION",
        metadata: {
          actionType: "CONFIRM",
          timeToActionMs: options?.decisionDurationMs ?? null
        }
      }
    ]);

    return mapped;
  }

  async dismiss(
    userId: string,
    obligationId: string,
    payload: unknown
  ) {
    const input = dismissSchema.parse(payload);
    const obligation = await this.repository.dismiss(obligationId, userId, input.reason);
    if (!obligation) return null;

    const mapped = mapObligation(obligation);
    await this.autoFlowService.handleObligationStatusChange(userId, obligationId, mapped.status);
    await this.captureMemorySignal(userId, obligationId, "obligation_dismissed");
    return mapped;
  }

  async postpone(
    userId: string,
    obligationId: string,
    payload: unknown,
    options?: {
      signalSource?: "TODAY_VIEW" | "DAILY_PULSE" | "OBLIGATION_ACTION";
      decisionDurationMs?: number | null;
    }
  ) {
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
    await this.captureMemorySignal(userId, obligationId, "obligation_postponed");
    await this.captureBehaviorSignals(userId, [
      {
        userId,
        signalType: "ITEM_DEFERRED",
        obligationId,
        itemId: obligationId,
        category: "OBLIGATION",
        source: options?.signalSource ?? "OBLIGATION_ACTION",
        metadata: {
          actionType: "REMIND_LATER",
          timeToActionMs: options?.decisionDurationMs ?? null
        }
      }
    ]);
    return mapped;
  }

  private async captureMemorySignal(userId: string, obligationId: string, eventType: string) {
    await this.homeMemoryService
      .captureSignal({
        userId,
        sourceType: "OBLIGATION_ACTION",
        referenceId: obligationId,
        eventType,
        rebuild: true
      })
      .catch(() => null);
  }

  private async captureBehaviorSignals(
    userId: string,
    signals: Parameters<PersonalizationSignalService["recordSignals"]>[0]
  ) {
    await this.personalizationSignalService.recordSignals(signals).catch(() => null);
    void this.behaviorProfileService.recomputeBehaviorProfile(userId).catch(() => null);
  }
}
