import {
  FocusSessionItemStatus,
  FocusSessionState,
  ObligationStatus,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";

const focusSessionInclude = {
  items: {
    include: {
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
    },
    orderBy: {
      position: "asc"
    }
  }
} satisfies Prisma.FocusSessionInclude;

type DbClient = Prisma.TransactionClient | typeof prisma;

export type FocusSessionWithRelations = Prisma.FocusSessionGetPayload<{
  include: typeof focusSessionInclude;
}>;

export class FocusModeRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async findActiveForUser(userId: string) {
    return prisma.focusSession.findFirst({
      where: {
        userId,
        state: FocusSessionState.ACTIVE
      },
      include: focusSessionInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async findByIdForUser(userId: string, sessionId: string) {
    return prisma.focusSession.findFirst({
      where: {
        id: sessionId,
        userId
      },
      include: focusSessionInclude
    });
  }

  async createSession(
    input: {
      userId: string;
      durationMinutes: number;
      sourceType?: Prisma.FocusSessionCreateInput["sourceType"];
      items: Array<{
        obligationId: string;
        position: number;
        whyIncluded: string;
        estimatedMinutes: number;
        priorityScore: number;
      }>;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.focusSession.create({
      data: {
        userId: input.userId,
        durationMinutes: input.durationMinutes,
        sourceType: input.sourceType,
        totalItems: input.items.length,
        items: {
          createMany: {
            data: input.items.map((item) => ({
              userId: input.userId,
              obligationId: item.obligationId,
              position: item.position,
              whyIncluded: item.whyIncluded,
              estimatedMinutes: item.estimatedMinutes,
              priorityScore: item.priorityScore
            }))
          }
        }
      },
      include: focusSessionInclude
    });
  }

  async updateSession(
    sessionId: string,
    data: Prisma.FocusSessionUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.focusSession.update({
      where: { id: sessionId },
      data,
      include: focusSessionInclude
    });
  }

  async updateItemStatus(
    input: {
      sessionId: string;
      userId: string;
      obligationId: string;
      status: FocusSessionItemStatus;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.focusSessionItem.updateMany({
      where: {
        focusSessionId: input.sessionId,
        userId: input.userId,
        obligationId: input.obligationId
      },
      data: {
        status: input.status
      }
    });
  }

  async updateItemById(
    itemId: string,
    data: Prisma.FocusSessionItemUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.focusSessionItem.update({
      where: {
        id: itemId
      },
      data
    });
  }

  async findItem(
    input: {
      sessionId: string;
      userId: string;
      obligationId: string;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.focusSessionItem.findFirst({
      where: {
        focusSessionId: input.sessionId,
        userId: input.userId,
        obligationId: input.obligationId
      },
      include: {
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
      }
    });
  }

  async findFirstPendingItem(
    input: { sessionId: string; userId: string },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.focusSessionItem.findFirst({
      where: {
        focusSessionId: input.sessionId,
        userId: input.userId,
        status: FocusSessionItemStatus.PENDING
      },
      orderBy: {
        position: "asc"
      }
    });
  }

  async findCurrentInProgressItem(
    input: { sessionId: string; userId: string },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.focusSessionItem.findFirst({
      where: {
        focusSessionId: input.sessionId,
        userId: input.userId,
        status: FocusSessionItemStatus.IN_PROGRESS
      },
      orderBy: {
        position: "asc"
      }
    });
  }

  async listObligationsForPlanning(userId: string) {
    return prisma.obligation.findMany({
      where: {
        userId,
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
      orderBy: [{ dueDate: "asc" }, { urgencyScore: "desc" }, { createdAt: "desc" }],
      take: 120
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
