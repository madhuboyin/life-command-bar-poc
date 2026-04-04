import {
  AutoFlowStateStatus,
  AutoFlowTriggerType,
  ObligationStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";

const autoFlowInclude = {
  obligation: {
    include: {
      importSource: {
        select: {
          id: true,
          subtype: true,
          parseStatus: true,
          parseConfidence: true,
          parserVersion: true,
          extractionSummary: true,
          rawData: true,
          createdAt: true
        }
      }
    }
  }
} satisfies Prisma.AutoFlowStateInclude;

type DbClient = Prisma.TransactionClient | typeof prisma;

export type AutoFlowWithRelations = Prisma.AutoFlowStateGetPayload<{
  include: typeof autoFlowInclude;
}>;

export class AutoFlowRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async findByIdForUser(userId: string, id: string) {
    return prisma.autoFlowState.findFirst({
      where: {
        id,
        userId
      },
      include: autoFlowInclude
    });
  }

  async listForUser(input: {
    userId: string;
    states?: AutoFlowStateStatus[];
    limit?: number;
  }) {
    return prisma.autoFlowState.findMany({
      where: {
        userId: input.userId,
        state: input.states
          ? {
              in: input.states
            }
          : undefined,
        obligation: {
          status: {
            in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED, ObligationStatus.DRAFT]
          }
        }
      },
      include: autoFlowInclude,
      orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
      take: input.limit ?? 20
    });
  }

  async countCreatedToday(userId: string, now: Date) {
    const dayStart = startOfDayUTC(now);
    return prisma.autoFlowState.count({
      where: {
        userId,
        createdAt: {
          gte: dayStart
        },
        state: {
          in: [AutoFlowStateStatus.READY, AutoFlowStateStatus.SUGGESTED]
        }
      }
    });
  }

  async findRecentForObligationTrigger(input: {
    userId: string;
    obligationId: string;
    triggerType: AutoFlowTriggerType;
    since: Date;
  }) {
    return prisma.autoFlowState.findFirst({
      where: {
        userId: input.userId,
        obligationId: input.obligationId,
        triggerType: input.triggerType,
        createdAt: {
          gte: input.since
        },
        state: {
          in: [
            AutoFlowStateStatus.READY,
            AutoFlowStateStatus.SUGGESTED,
            AutoFlowStateStatus.ACCEPTED
          ]
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async findLatestActiveForObligation(userId: string, obligationId: string) {
    return prisma.autoFlowState.findFirst({
      where: {
        userId,
        obligationId,
        state: {
          in: [AutoFlowStateStatus.READY, AutoFlowStateStatus.SUGGESTED]
        }
      },
      include: autoFlowInclude,
      orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }]
    });
  }

  async countDismissedRecently(input: {
    userId: string;
    obligationId: string;
    since: Date;
  }) {
    return prisma.autoFlowState.count({
      where: {
        userId: input.userId,
        obligationId: input.obligationId,
        state: AutoFlowStateStatus.DISMISSED,
        updatedAt: {
          gte: input.since
        }
      }
    });
  }

  async create(
    input: {
      userId: string;
      obligationId: string;
      triggerType: AutoFlowTriggerType;
      state: AutoFlowStateStatus;
      confidenceScore: number;
      urgencyScore: number;
      priorityScore: number;
      sourceType?: string | null;
      reason?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.autoFlowState.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId,
        triggerType: input.triggerType,
        state: input.state,
        confidenceScore: input.confidenceScore,
        urgencyScore: input.urgencyScore,
        priorityScore: input.priorityScore,
        sourceType: input.sourceType ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? undefined
      },
      include: autoFlowInclude
    });
  }

  async update(
    id: string,
    data: Prisma.AutoFlowStateUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.autoFlowState.update({
      where: { id },
      data,
      include: autoFlowInclude
    });
  }

  async dismissActiveForObligation(
    input: { userId: string; obligationId: string; reason: string },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.autoFlowState.updateMany({
      where: {
        userId: input.userId,
        obligationId: input.obligationId,
        state: {
          in: [AutoFlowStateStatus.READY, AutoFlowStateStatus.SUGGESTED]
        }
      },
      data: {
        state: AutoFlowStateStatus.DISMISSED,
        reason: input.reason,
        dismissedAt: new Date(),
        dismissedCount: {
          increment: 1
        }
      }
    });
  }

  async listDueScheduledReminders(userId: string, now: Date) {
    return prisma.reminder.findMany({
      where: {
        userId,
        obligationId: {
          not: null
        },
        status: "SCHEDULED",
        scheduledFor: {
          lte: now
        }
      },
      orderBy: {
        scheduledFor: "asc"
      },
      take: 25
    });
  }

  async markReminderTriggered(reminderId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);
    return db.reminder.update({
      where: {
        id: reminderId
      },
      data: {
        status: "TRIGGERED"
      }
    });
  }

  async findObligationByIdForUser(userId: string, obligationId: string) {
    return prisma.obligation.findFirst({
      where: {
        id: obligationId,
        userId
      },
      include: {
        importSource: {
          select: {
            id: true,
            subtype: true,
            parseStatus: true,
            parseConfidence: true,
            parserVersion: true,
            extractionSummary: true,
            rawData: true,
            createdAt: true
          }
        }
      }
    });
  }

  async findNextPatternCandidate(input: {
    userId: string;
    type: Prisma.ObligationScalarWhereInput["type"];
    excludeObligationId: string;
  }) {
    return prisma.obligation.findFirst({
      where: {
        userId: input.userId,
        id: {
          not: input.excludeObligationId
        },
        type: input.type,
        status: {
          in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED]
        }
      },
      include: {
        importSource: {
          select: {
            id: true,
            subtype: true,
            parseStatus: true,
            parseConfidence: true,
            parserVersion: true,
            extractionSummary: true,
            rawData: true,
            createdAt: true
          }
        }
      },
      orderBy: [{ urgencyScore: "desc" }, { importanceScore: "desc" }, { dueDate: "asc" }]
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
    return createAuditEvent(
      {
        userId: input.userId,
        obligationId: input.obligationId,
        eventType: input.eventType,
        metadata: input.metadata
      },
      db
    );
  }
}

function getDb(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

function startOfDayUTC(input: Date) {
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 0, 0, 0, 0)
  );
}
