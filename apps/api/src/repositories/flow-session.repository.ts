import { FlowSessionState, Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";

const flowSessionInclude = {
  currentObligation: {
    select: {
      id: true,
      title: true,
      status: true
    }
  },
  currentJourney: {
    select: {
      id: true,
      status: true
    }
  }
} satisfies Prisma.FlowSessionInclude;

type DbClient = Prisma.TransactionClient | typeof prisma;

export type FlowSessionWithRelations = Prisma.FlowSessionGetPayload<{
  include: typeof flowSessionInclude;
}>;

export class FlowSessionRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async findByIdForUser(userId: string, id: string) {
    return prisma.flowSession.findFirst({
      where: {
        id,
        userId
      },
      include: flowSessionInclude
    });
  }

  async findLatestActiveForSource(userId: string, sourceType: Prisma.FlowSessionCreateInput["sourceType"]) {
    return prisma.flowSession.findFirst({
      where: {
        userId,
        sourceType,
        state: FlowSessionState.ACTIVE
      },
      include: flowSessionInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async create(
    input: {
      userId: string;
      sourceType: Prisma.FlowSessionCreateInput["sourceType"];
      sourceContext?: Prisma.InputJsonValue | null;
      currentObligationId: string;
      currentJourneyId?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.flowSession.create({
      data: {
        userId: input.userId,
        sourceType: input.sourceType,
        sourceContext: input.sourceContext ?? null,
        currentObligationId: input.currentObligationId,
        currentJourneyId: input.currentJourneyId ?? null,
        state: FlowSessionState.ACTIVE
      },
      include: flowSessionInclude
    });
  }

  async update(
    id: string,
    data: Prisma.FlowSessionUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.flowSession.update({
      where: { id },
      data,
      include: flowSessionInclude
    });
  }

  async listObligationsByIds(userId: string, obligationIds: string[]) {
    if (obligationIds.length === 0) return [];
    return prisma.obligation.findMany({
      where: {
        userId,
        id: {
          in: obligationIds
        }
      },
      select: {
        id: true,
        title: true,
        status: true
      }
    });
  }

  async createAuditEvent(
    input: {
      userId: string;
      obligationId?: string | null;
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
