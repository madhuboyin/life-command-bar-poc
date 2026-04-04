import {
  ObligationStatus,
  PredictionConfidenceBand,
  PredictionReferenceType,
  PredictionStatus,
  PredictionType,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";

type DbClient = Prisma.TransactionClient | typeof prisma;

const predictionInclude = {
  promotedObligation: {
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
} satisfies Prisma.PredictionInclude;

export type PredictionWithRelations = Prisma.PredictionGetPayload<{
  include: typeof predictionInclude;
}>;

export class PredictionRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async findByIdForUser(userId: string, id: string) {
    return prisma.prediction.findFirst({
      where: {
        userId,
        id
      },
      include: predictionInclude
    });
  }

  async listForUser(input: {
    userId: string;
    status?: PredictionStatus[];
    types?: PredictionType[];
    limit?: number;
  }) {
    return prisma.prediction.findMany({
      where: {
        userId: input.userId,
        status: input.status
          ? {
              in: input.status
            }
          : undefined,
        predictionType: input.types
          ? {
              in: input.types
            }
          : undefined
      },
      include: predictionInclude,
      orderBy: [{ predictedDate: "asc" }, { confidenceScore: "desc" }, { createdAt: "desc" }],
      take: input.limit ?? 200
    });
  }

  async listUpcomingWindows(input: { userId: string; now: Date; days: number[] }) {
    const maxDays = Math.max(...input.days, 0);
    const maxDate = new Date(input.now.getTime() + maxDays * 24 * 60 * 60 * 1000);

    return prisma.prediction.findMany({
      where: {
        userId: input.userId,
        status: PredictionStatus.ACTIVE,
        OR: [
          {
            predictedDate: {
              gte: input.now,
              lte: maxDate
            }
          },
          {
            predictionWindowStart: {
              lte: maxDate
            },
            predictionWindowEnd: {
              gte: input.now
            }
          }
        ]
      },
      include: predictionInclude,
      orderBy: [{ predictedDate: "asc" }, { confidenceScore: "desc" }, { createdAt: "desc" }]
    });
  }

  async upsertPrediction(
    input: {
      userId: string;
      predictionType: PredictionType;
      referenceType: PredictionReferenceType;
      referenceId: string;
      title: string;
      description?: string | null;
      predictedDate?: Date | null;
      predictionWindowStart?: Date | null;
      predictionWindowEnd?: Date | null;
      confidenceScore: number;
      confidenceBand: PredictionConfidenceBand;
      rationale?: Prisma.InputJsonValue;
      rationaleSummary?: string | null;
      status?: PredictionStatus;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    const where = {
      userId_predictionType_referenceType_referenceId: {
        userId: input.userId,
        predictionType: input.predictionType,
        referenceType: input.referenceType,
        referenceId: input.referenceId
      }
    } satisfies Prisma.PredictionWhereUniqueInput;

    const existing = await db.prediction.findUnique({
      where
    });

    if (!existing) {
      return db.prediction.create({
        data: {
          userId: input.userId,
          predictionType: input.predictionType,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          title: input.title,
          description: input.description ?? null,
          predictedDate: input.predictedDate ?? null,
          predictionWindowStart: input.predictionWindowStart ?? null,
          predictionWindowEnd: input.predictionWindowEnd ?? null,
          confidenceScore: input.confidenceScore,
          confidenceBand: input.confidenceBand,
          rationale: input.rationale ?? undefined,
          rationaleSummary: input.rationaleSummary ?? null,
          status: input.status ?? PredictionStatus.ACTIVE
        },
        include: predictionInclude
      });
    }

    const preservedStatus =
      !input.status &&
      (existing.status === PredictionStatus.DISMISSED ||
        existing.status === PredictionStatus.PROMOTED_TO_OBLIGATION)
        ? existing.status
        : input.status ?? PredictionStatus.ACTIVE;

    return db.prediction.update({
      where: {
        id: existing.id
      },
      data: {
        title: input.title,
        description: input.description ?? null,
        predictedDate: input.predictedDate ?? null,
        predictionWindowStart: input.predictionWindowStart ?? null,
        predictionWindowEnd: input.predictionWindowEnd ?? null,
        confidenceScore: input.confidenceScore,
        confidenceBand: input.confidenceBand,
        rationale: input.rationale ?? undefined,
        rationaleSummary: input.rationaleSummary ?? null,
        status: preservedStatus
      },
      include: predictionInclude
    });
  }

  async updatePrediction(
    id: string,
    data: Prisma.PredictionUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.prediction.update({
      where: { id },
      data,
      include: predictionInclude
    });
  }

  async deletePrediction(id: string, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);
    return db.prediction.delete({
      where: { id }
    });
  }

  async expireActiveNotInKeys(input: { userId: string; keepKeys: string[] }, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);
    if (input.keepKeys.length === 0) {
      return db.prediction.updateMany({
        where: {
          userId: input.userId,
          status: PredictionStatus.ACTIVE
        },
        data: {
          status: PredictionStatus.EXPIRED
        }
      });
    }

    return db.prediction.updateMany({
      where: {
        userId: input.userId,
        status: PredictionStatus.ACTIVE,
        NOT: {
          OR: input.keepKeys.map((key) => {
            const [predictionType, referenceType, referenceId] = key.split("|");
            return {
              predictionType: predictionType as PredictionType,
              referenceType: referenceType as PredictionReferenceType,
              referenceId
            };
          })
        }
      },
      data: {
        status: PredictionStatus.EXPIRED
      }
    });
  }

  async listActiveMatchingObligation(input: {
    userId: string;
    vendorKey?: string | null;
    obligationType?: string | null;
    dueDate?: Date | null;
    limit?: number;
  }) {
    const type = toPredictionType(input.obligationType);
    const fromDate = input.dueDate
      ? new Date(input.dueDate.getTime() - 7 * 24 * 60 * 60 * 1000)
      : null;
    const toDate = input.dueDate
      ? new Date(input.dueDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      : null;

    return prisma.prediction.findMany({
      where: {
        userId: input.userId,
        status: PredictionStatus.ACTIVE,
        predictionType: {
          in: [
            PredictionType.RECURRING_NEXT_OCCURRENCE,
            PredictionType.MISSING_EXPECTED_OBLIGATION,
            PredictionType.UPCOMING_ATTENTION
          ]
        },
        OR: [
          {
            rationale: {
              path: ["vendorKey"],
              equals: input.vendorKey ?? undefined
            }
          },
          type
            ? {
                rationale: {
                  path: ["obligationType"],
                  equals: type
                }
              }
            : {}
        ],
        predictedDate:
          fromDate && toDate
            ? {
                gte: fromDate,
                lte: toDate
              }
            : undefined
      },
      include: predictionInclude,
      orderBy: [{ confidenceScore: "desc" }, { predictedDate: "asc" }, { createdAt: "desc" }],
      take: input.limit ?? 10
    });
  }

  async listActiveForObligationIds(userId: string, obligationIds: string[]) {
    if (obligationIds.length === 0) return [];

    return prisma.prediction.findMany({
      where: {
        userId,
        status: PredictionStatus.ACTIVE,
        referenceType: PredictionReferenceType.OBLIGATION,
        referenceId: {
          in: obligationIds
        },
        predictionType: PredictionType.UPCOMING_ATTENTION
      },
      include: predictionInclude
    });
  }

  async listMemoryPatterns(userId: string) {
    return prisma.memoryPattern.findMany({
      where: {
        userId,
        patternType: {
          in: ["RECURRING_OBLIGATION", "USER_BEHAVIOR", "TIMING_PATTERN"]
        },
        isSuppressed: false
      },
      orderBy: [{ confidence: "desc" }, { frequency: "desc" }, { updatedAt: "desc" }]
    });
  }

  async listMemoryEntities(userId: string) {
    return prisma.memoryEntity.findMany({
      where: {
        userId
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
    });
  }

  async listOpenObligations(userId: string) {
    return prisma.obligation.findMany({
      where: {
        userId,
        status: {
          in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED, ObligationStatus.DRAFT]
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
      orderBy: [{ dueDate: "asc" }, { urgencyScore: "desc" }, { updatedAt: "desc" }]
    });
  }

  async listUpcomingReminders(userId: string, now: Date, days = 30) {
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return prisma.reminder.findMany({
      where: {
        userId,
        status: {
          in: ["SCHEDULED", "TRIGGERED"]
        },
        scheduledFor: {
          gte: now,
          lte: end
        }
      },
      orderBy: [{ scheduledFor: "asc" }]
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

  async getFreshness(userId: string) {
    const [latestPrediction, latestMemoryEvent, latestObligation, latestReminder] =
      await Promise.all([
        prisma.prediction.findFirst({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true }
        }),
        prisma.memoryEvent.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        }),
        prisma.obligation.findFirst({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true }
        }),
        prisma.reminder.findFirst({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true }
        })
      ]);

    return {
      latestPredictionAt: latestPrediction?.updatedAt ?? null,
      latestMemoryEventAt: latestMemoryEvent?.createdAt ?? null,
      latestObligationAt: latestObligation?.updatedAt ?? null,
      latestReminderAt: latestReminder?.updatedAt ?? null
    };
  }
}

function getDb(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

function toPredictionType(value: string | null | undefined) {
  if (value === "BILL" || value === "SUBSCRIPTION" || value === "RENEWAL" || value === "COMMITMENT") {
    return value;
  }
  return null;
}
