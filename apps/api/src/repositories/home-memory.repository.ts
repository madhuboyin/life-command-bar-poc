import {
  MemoryEntityType,
  MemoryEventSourceType,
  MemoryPatternType,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class HomeMemoryRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async listEntities(input: {
    userId: string;
    type?: MemoryEntityType;
    limit?: number;
  }) {
    return prisma.memoryEntity.findMany({
      where: {
        userId: input.userId,
        type: input.type
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: input.limit ?? 200
    });
  }

  async listPatterns(input: {
    userId: string;
    patternType?: MemoryPatternType;
    referenceId?: string;
    includeSuppressed?: boolean;
    limit?: number;
  }) {
    return prisma.memoryPattern.findMany({
      where: {
        userId: input.userId,
        patternType: input.patternType,
        referenceId: input.referenceId,
        isSuppressed: input.includeSuppressed ? undefined : false
      },
      orderBy: [{ confidence: "desc" }, { frequency: "desc" }, { updatedAt: "desc" }],
      take: input.limit ?? 300
    });
  }

  async findPatternByIdForUser(userId: string, id: string) {
    return prisma.memoryPattern.findFirst({
      where: {
        id,
        userId
      }
    });
  }

  async findPatternByUnique(input: {
    userId: string;
    patternType: MemoryPatternType;
    referenceId: string;
  }) {
    return prisma.memoryPattern.findFirst({
      where: {
        userId: input.userId,
        patternType: input.patternType,
        referenceId: input.referenceId
      }
    });
  }

  async upsertPattern(
    input: {
      userId: string;
      patternType: MemoryPatternType;
      referenceId: string;
      patternData: Prisma.InputJsonValue;
      confidence: number;
      frequency: number;
      lastObservedAt?: Date | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.memoryPattern.upsert({
      where: {
        userId_patternType_referenceId: {
          userId: input.userId,
          patternType: input.patternType,
          referenceId: input.referenceId
        }
      },
      create: {
        userId: input.userId,
        patternType: input.patternType,
        referenceId: input.referenceId,
        patternData: input.patternData,
        confidence: input.confidence,
        frequency: input.frequency,
        lastObservedAt: input.lastObservedAt ?? null
      },
      update: {
        patternData: input.patternData,
        confidence: input.confidence,
        frequency: input.frequency,
        lastObservedAt: input.lastObservedAt ?? null
      }
    });
  }

  async deleteStaleDerivedPatterns(
    input: {
      userId: string;
      patternType: MemoryPatternType;
      keepReferenceIds: string[];
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.memoryPattern.deleteMany({
      where: {
        userId: input.userId,
        patternType: input.patternType,
        referenceId: {
          notIn: input.keepReferenceIds.length > 0 ? input.keepReferenceIds : ["__none__"]
        },
        isUserLocked: false,
        isSuppressed: false
      }
    });
  }

  async updatePattern(
    id: string,
    data: Prisma.MemoryPatternUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.memoryPattern.update({
      where: { id },
      data
    });
  }

  async deletePattern(id: string, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);
    return db.memoryPattern.delete({
      where: { id }
    });
  }

  async replaceEntities(
    userId: string,
    entities: Array<{
      type: MemoryEntityType;
      name: string;
      normalizedKey: string;
      metadata?: Prisma.InputJsonValue;
    }>,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    await db.memoryEntity.deleteMany({
      where: {
        userId
      }
    });

    if (entities.length === 0) return;
    await db.memoryEntity.createMany({
      data: entities.map((entity) => ({
        userId,
        type: entity.type,
        name: entity.name,
        normalizedKey: entity.normalizedKey,
        metadata: entity.metadata
      }))
    });
  }

  async upsertContext(
    input: {
      userId: string;
      currentFocus?: string | null;
      recentActions?: Prisma.InputJsonValue;
      activeCategories?: Prisma.InputJsonValue;
      cognitiveLoadScore: number;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.memoryContext.upsert({
      where: {
        userId: input.userId
      },
      create: {
        userId: input.userId,
        currentFocus: input.currentFocus ?? null,
        recentActions: input.recentActions ?? Prisma.JsonNull,
        activeCategories: input.activeCategories ?? Prisma.JsonNull,
        cognitiveLoadScore: input.cognitiveLoadScore
      },
      update: {
        currentFocus: input.currentFocus ?? null,
        recentActions: input.recentActions ?? Prisma.JsonNull,
        activeCategories: input.activeCategories ?? Prisma.JsonNull,
        cognitiveLoadScore: input.cognitiveLoadScore
      }
    });
  }

  async getContext(userId: string) {
    return prisma.memoryContext.findUnique({
      where: { userId }
    });
  }

  async createMemoryEvent(
    input: {
      userId: string;
      sourceType: MemoryEventSourceType;
      referenceId?: string | null;
      eventType: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.memoryEvent.create({
      data: {
        userId: input.userId,
        sourceType: input.sourceType,
        referenceId: input.referenceId ?? null,
        eventType: input.eventType,
        metadata: input.metadata
      }
    });
  }

  async listRecentMemoryEvents(userId: string, limit = 100) {
    return prisma.memoryEvent.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: limit
    });
  }

  async listRebuildObligations(userId: string) {
    return prisma.obligation.findMany({
      where: {
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
      },
      orderBy: [{ updatedAt: "desc" }]
    });
  }

  async listRebuildFeedback(userId: string) {
    return prisma.feedbackEvent.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 1200
    });
  }

  async listRebuildAuditEvents(userId: string) {
    return prisma.auditEvent.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 2000
    });
  }

  async listRebuildOutcomeFeedback(userId: string) {
    return prisma.outcomeFeedback.findMany({
      where: {
        userId
      },
      include: {
        obligation: {
          select: {
            id: true,
            type: true,
            title: true,
            vendor: true,
            dueDate: true,
            status: true,
            urgencyScore: true,
            importanceScore: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 1200
    });
  }
}

function getDb(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}
