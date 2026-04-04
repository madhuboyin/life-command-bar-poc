import { OutcomeSourceContext, OutcomeType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { AppError } from "../utils/app-error";
import { HomeMemoryService } from "./home-memory.service";

const outcomeFeedbackSchema = z.object({
  userId: z.string().min(1),
  obligationId: z.string().optional(),
  guidedJourneyId: z.string().optional(),
  resolutionRunId: z.string().optional(),
  sourceContext: z.nativeEnum(OutcomeSourceContext),
  recommendationKey: z.string().optional(),
  selectedActionKey: z.string().min(1),
  outcomeType: z.nativeEnum(OutcomeType),
  note: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export class OutcomeFeedbackService {
  private readonly homeMemoryService = new HomeMemoryService();

  async create(payload: unknown) {
    const input = outcomeFeedbackSchema.parse(payload);

    let obligationId = input.obligationId ?? null;

    if (input.obligationId) {
      await assertObligationOwnedByUser(input.userId, input.obligationId);
    }

    if (input.guidedJourneyId) {
      const journey = await prisma.guidedJourney.findFirst({
        where: {
          id: input.guidedJourneyId,
          userId: input.userId
        },
        select: {
          id: true,
          obligationId: true
        }
      });

      if (!journey) {
        throw new AppError("NOT_FOUND", "Guided journey not found", 404);
      }

      if (!obligationId) {
        obligationId = journey.obligationId;
      }
    }

    if (input.resolutionRunId) {
      const resolutionRun = await prisma.resolutionRun.findFirst({
        where: {
          id: input.resolutionRunId,
          userId: input.userId
        },
        select: {
          id: true,
          obligationId: true
        }
      });

      if (!resolutionRun) {
        throw new AppError("NOT_FOUND", "Resolution run not found", 404);
      }

      if (!obligationId) {
        obligationId = resolutionRun.obligationId;
      }
    }

    const outcomeFeedback = await prisma.outcomeFeedback.create({
      data: {
        userId: input.userId,
        obligationId,
        guidedJourneyId: input.guidedJourneyId,
        resolutionRunId: input.resolutionRunId,
        sourceContext: input.sourceContext,
        recommendationKey: input.recommendationKey,
        selectedActionKey: input.selectedActionKey,
        outcomeType: input.outcomeType,
        note: input.note,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });

    await createAuditEvent({
      userId: input.userId,
      obligationId,
      eventType: "outcome_feedback_submitted",
      metadata: {
        outcomeFeedbackId: outcomeFeedback.id,
        sourceContext: input.sourceContext,
        outcomeType: input.outcomeType,
        selectedActionKey: input.selectedActionKey,
        recommendationKey: input.recommendationKey ?? null
      }
    });

    await this.homeMemoryService
      .captureSignal({
        userId: input.userId,
        sourceType: "FEEDBACK",
        referenceId: obligationId,
        eventType: "outcome_feedback_submitted",
        metadata: {
          sourceContext: input.sourceContext,
          outcomeType: input.outcomeType,
          selectedActionKey: input.selectedActionKey
        },
        rebuild: true
      })
      .catch(() => null);

    return outcomeFeedback;
  }
}

async function assertObligationOwnedByUser(userId: string, obligationId: string) {
  const obligation = await prisma.obligation.findFirst({
    where: {
      id: obligationId,
      userId
    },
    select: {
      id: true
    }
  });

  if (!obligation) {
    throw new AppError("NOT_FOUND", "Obligation not found", 404);
  }
}
