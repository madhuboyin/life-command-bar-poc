import {
  GuidedJourneyEventType,
  GuidedJourneyStatus,
  GuidedJourneyType,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import type { GuidedJourneyTemplate } from "../types/guided-journey.types";

const journeyInclude = {
  obligation: true,
  steps: {
    orderBy: {
      position: "asc"
    }
  }
} satisfies Prisma.GuidedJourneyInclude;

type DbClient = Prisma.TransactionClient | typeof prisma;

export type GuidedJourneyWithRelations = Prisma.GuidedJourneyGetPayload<{
  include: typeof journeyInclude;
}>;

export class GuidedJourneyRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async findObligationById(userId: string, obligationId: string) {
    return prisma.obligation.findFirst({
      where: {
        id: obligationId,
        userId
      }
    });
  }

  async findActiveJourneyByObligation(userId: string, obligationId: string) {
    return prisma.guidedJourney.findFirst({
      where: {
        userId,
        obligationId,
        status: GuidedJourneyStatus.ACTIVE
      },
      include: journeyInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async findByIdForUser(userId: string, journeyId: string) {
    return prisma.guidedJourney.findFirst({
      where: {
        id: journeyId,
        userId
      },
      include: journeyInclude
    });
  }

  async createJourneyFromTemplate(
    input: {
      userId: string;
      obligationId: string;
      template: GuidedJourneyTemplate;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);

    return db.guidedJourney.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId,
        journeyType: input.template.journeyType as GuidedJourneyType,
        status: GuidedJourneyStatus.ACTIVE,
        currentStepIndex: 0,
        currentStepKey: input.template.steps[0]?.key ?? null,
        summary: input.template.summary,
        recommendedPath: input.template.recommendedPath,
        steps: {
          create: input.template.steps.map((step, index) => ({
            stepKey: step.key,
            title: step.title,
            description: step.description,
            whyItMatters: step.whyItMatters,
            inputType: step.inputType,
            optionsJson: step.options,
            recommendedOption: step.recommendedOption,
            selectedOption: null,
            isCompleted: false,
            position: index
          }))
        }
      },
      include: journeyInclude
    });
  }

  async updateCurrentStep(
    journeyId: string,
    payload: {
      currentStepIndex: number;
      currentStepKey: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);

    return db.guidedJourney.update({
      where: { id: journeyId },
      data: {
        currentStepIndex: payload.currentStepIndex,
        currentStepKey: payload.currentStepKey
      }
    });
  }

  async updateJourneyStatus(
    journeyId: string,
    status: GuidedJourneyStatus,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    const completedAt = status === GuidedJourneyStatus.COMPLETED ? new Date() : null;

    return db.guidedJourney.update({
      where: { id: journeyId },
      data: {
        status,
        completedAt
      }
    });
  }

  async setStepSelectedOption(
    stepId: string,
    optionKey: string,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);

    return db.guidedJourneyStep.update({
      where: { id: stepId },
      data: {
        selectedOption: optionKey
      }
    });
  }

  async markStepCompleted(stepId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);

    return db.guidedJourneyStep.update({
      where: { id: stepId },
      data: {
        isCompleted: true,
        completedAt: new Date()
      }
    });
  }

  async markAllStepsCompleted(journeyId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);

    await db.guidedJourneyStep.updateMany({
      where: {
        journeyId,
        isCompleted: false
      },
      data: {
        isCompleted: true,
        completedAt: new Date()
      }
    });
  }

  async createJourneyEvent(
    input: {
      journeyId: string;
      userId: string;
      obligationId: string;
      eventType: GuidedJourneyEventType;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);

    return db.guidedJourneyEvent.create({
      data: {
        journeyId: input.journeyId,
        userId: input.userId,
        obligationId: input.obligationId,
        eventType: input.eventType,
        metadata: input.metadata
      }
    });
  }

  async createAuditEvent(
    input: {
      userId: string;
      obligationId: string;
      eventType: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);

    return db.auditEvent.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId,
        eventType: input.eventType,
        metadata: input.metadata
      }
    });
  }
}

function getDb(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}
