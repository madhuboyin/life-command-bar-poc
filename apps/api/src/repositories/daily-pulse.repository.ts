import { DailyPulseItemStatus, Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class DailyPulseRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async findStateByDate(userId: string, date: string) {
    return prisma.dailyPulseState.findUnique({
      where: {
        userId_date: {
          userId,
          date
        }
      }
    });
  }

  async createState(
    input: { userId: string; date: string; openedAt?: Date | null },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.dailyPulseState.create({
      data: {
        userId: input.userId,
        date: input.date,
        openedAt: input.openedAt ?? null
      }
    });
  }

  async updateState(
    id: string,
    data: Prisma.DailyPulseStateUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.dailyPulseState.update({
      where: { id },
      data
    });
  }

  async listItemStates(stateId: string) {
    return prisma.dailyPulseItemState.findMany({
      where: {
        dailyPulseStateId: stateId
      },
      orderBy: {
        createdAt: "asc"
      }
    });
  }

  async findItemState(stateId: string, obligationId: string) {
    return prisma.dailyPulseItemState.findUnique({
      where: {
        dailyPulseStateId_obligationId: {
          dailyPulseStateId: stateId,
          obligationId
        }
      }
    });
  }

  async createItemState(
    input: {
      dailyPulseStateId: string;
      userId: string;
      obligationId: string;
      hookType?: string | null;
      sourceType?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.dailyPulseItemState.create({
      data: {
        dailyPulseStateId: input.dailyPulseStateId,
        userId: input.userId,
        obligationId: input.obligationId,
        hookType: input.hookType ?? null,
        sourceType: input.sourceType ?? null,
        status: DailyPulseItemStatus.PENDING
      }
    });
  }

  async updateItemStateStatus(
    stateId: string,
    obligationId: string,
    status: DailyPulseItemStatus,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.dailyPulseItemState.update({
      where: {
        dailyPulseStateId_obligationId: {
          dailyPulseStateId: stateId,
          obligationId
        }
      },
      data: {
        status
      }
    });
  }

  async countByStatus(stateId: string) {
    const grouped = await prisma.dailyPulseItemState.groupBy({
      by: ["status"],
      where: {
        dailyPulseStateId: stateId
      },
      _count: {
        _all: true
      }
    });

    const counts: Record<DailyPulseItemStatus, number> = {
      PENDING: 0,
      OPENED_GUIDED: 0,
      COMPLETED: 0,
      POSTPONED: 0,
      DISMISSED: 0
    };

    for (const item of grouped) {
      counts[item.status] = item._count._all;
    }

    return counts;
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
