import {
  ImportParseStatus,
  ImportSourceSubtype,
  ImportSourceType,
  ObligationSource,
  ObligationStatus,
  ObligationType,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";

export type CreateImportSourceInput = {
  userId: string;
  type: ImportSourceType;
  subtype: ImportSourceSubtype;
  rawData: Prisma.InputJsonValue;
  rawText: string;
  normalizedText: string;
  contentHash: string;
  parserVersion: string;
  uploadId?: string;
};

export type CreateObligationFromIngestionInput = {
  userId: string;
  importSourceId: string;
  type: ObligationType;
  title: string;
  description?: string | null;
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  source: ObligationSource;
  confidenceScore: number;
  urgencyScore: number;
  importanceScore: number;
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  status: ObligationStatus;
};

export class IngestionRepository {
  async findMostRecentByContentHash(input: {
    userId: string;
    subtype: ImportSourceSubtype;
    contentHash: string;
  }) {
    return prisma.importSource.findFirst({
      where: {
        userId: input.userId,
        subtype: input.subtype,
        contentHash: input.contentHash
      },
      include: {
        obligations: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async createImportSource(input: CreateImportSourceInput) {
    return prisma.importSource.create({
      data: {
        userId: input.userId,
        type: input.type,
        subtype: input.subtype,
        rawData: input.rawData,
        rawText: input.rawText,
        normalizedText: input.normalizedText,
        parseStatus: ImportParseStatus.RECEIVED,
        parseConfidence: 0,
        parserVersion: input.parserVersion,
        contentHash: input.contentHash,
        uploadId: input.uploadId
      }
    });
  }

  async updateImportSourceParseResult(input: {
    importSourceId: string;
    parseStatus: ImportParseStatus;
    parseConfidence: number;
    extractionSummary?: Prisma.InputJsonValue;
  }) {
    return prisma.importSource.update({
      where: {
        id: input.importSourceId
      },
      data: {
        parseStatus: input.parseStatus,
        parseConfidence: input.parseConfidence,
        extractionSummary: input.extractionSummary
      }
    });
  }

  async createObligationFromIngestion(input: CreateObligationFromIngestionInput) {
    return prisma.obligation.create({
      data: {
        userId: input.userId,
        importSourceId: input.importSourceId,
        type: input.type,
        title: input.title,
        description: input.description,
        vendor: input.vendor,
        amount: input.amount,
        currency: input.amount !== null && input.amount !== undefined ? input.currency ?? "USD" : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        recurrence: input.recurrence,
        source: input.source,
        status: input.status,
        confidenceScore: input.confidenceScore,
        urgencyScore: input.urgencyScore,
        importanceScore: input.importanceScore,
        effortLevel: input.effortLevel,
        impactLevel: input.impactLevel
      }
    });
  }

  async createAuditEvent(input: {
    userId: string;
    obligationId?: string;
    eventType: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return createAuditEvent({
      userId: input.userId,
      obligationId: input.obligationId,
      eventType: input.eventType,
      metadata: input.metadata
    });
  }

  async findObligationByIdForUser(obligationId: string, userId: string) {
    return prisma.obligation.findFirst({
      where: {
        id: obligationId,
        userId
      },
      include: {
        importSource: true
      }
    });
  }

  async updateObligationForUser(input: {
    obligationId: string;
    userId: string;
    data: Prisma.ObligationUpdateInput;
  }) {
    const existing = await prisma.obligation.findFirst({
      where: {
        id: input.obligationId,
        userId: input.userId
      }
    });

    if (!existing) {
      return null;
    }

    return prisma.obligation.update({
      where: {
        id: input.obligationId
      },
      data: input.data,
      include: {
        importSource: true
      }
    });
  }

  async findDuplicateByStructuredFields(input: {
    userId: string;
    vendor: string | null;
    amount: number | null;
    dueDate: string | null;
    type: ObligationType;
  }) {
    if (!input.vendor || input.amount === null || !input.dueDate) {
      return null;
    }

    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return null;
    }

    const dayStart = startOfDayUTC(dueDate);
    const dayEnd = endOfDayUTC(dueDate);

    return prisma.obligation.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        status: {
          in: [ObligationStatus.DRAFT, ObligationStatus.ACTIVE, ObligationStatus.POSTPONED]
        },
        vendor: {
          equals: input.vendor,
          mode: "insensitive"
        },
        amount: input.amount,
        dueDate: {
          gte: dayStart,
          lte: dayEnd
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async findConflictByStructuredFields(input: {
    userId: string;
    vendor: string | null;
    amount: number | null;
    dueDate: string | null;
    type: ObligationType;
  }) {
    if (!input.vendor || !input.dueDate) {
      return null;
    }

    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return null;
    }

    const dayStart = startOfDayUTC(dueDate);
    const dayEnd = endOfDayUTC(dueDate);
    const windowStart = new Date(dayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(dayEnd.getTime() + 7 * 24 * 60 * 60 * 1000);

    const candidates = await prisma.obligation.findMany({
      where: {
        userId: input.userId,
        status: {
          in: [ObligationStatus.DRAFT, ObligationStatus.ACTIVE, ObligationStatus.POSTPONED]
        },
        vendor: {
          equals: input.vendor,
          mode: "insensitive"
        },
        dueDate: {
          gte: windowStart,
          lte: windowEnd
        }
      },
      select: {
        id: true,
        type: true,
        amount: true,
        dueDate: true
      },
      take: 25,
      orderBy: {
        createdAt: "desc"
      }
    });

    const normalizedIncomingAmount =
      input.amount === null ? null : Number(input.amount.toFixed(2));

    for (const item of candidates) {
      if (!item.dueDate) continue;

      const itemAmount = item.amount === null ? null : Number(item.amount.toFixed(2));
      const sameDay = item.dueDate >= dayStart && item.dueDate <= dayEnd;

      if (sameDay && normalizedIncomingAmount !== null && itemAmount !== normalizedIncomingAmount) {
        return {
          obligationId: item.id,
          reason: "same_vendor_same_date_different_amount"
        };
      }

      if (
        normalizedIncomingAmount !== null &&
        itemAmount === normalizedIncomingAmount &&
        !sameDay
      ) {
        return {
          obligationId: item.id,
          reason: "same_vendor_same_amount_different_date"
        };
      }

      if (sameDay && item.type !== input.type) {
        return {
          obligationId: item.id,
          reason: "same_vendor_same_date_mixed_type"
        };
      }
    }

    return null;
  }

  async findPotentialSubscriptionMatches(input: {
    userId: string;
    vendor: string;
    limit?: number;
  }) {
    const vendor = input.vendor.trim();
    if (!vendor) return [];

    return prisma.obligation.findMany({
      where: {
        userId: input.userId,
        type: {
          in: [ObligationType.SUBSCRIPTION, ObligationType.RENEWAL, ObligationType.BILL]
        },
        status: {
          in: [
            ObligationStatus.DRAFT,
            ObligationStatus.ACTIVE,
            ObligationStatus.POSTPONED,
            ObligationStatus.RESOLVED
          ]
        },
        OR: [
          {
            vendor: {
              equals: vendor,
              mode: "insensitive"
            }
          },
          {
            vendor: {
              contains: vendor,
              mode: "insensitive"
            }
          },
          {
            title: {
              contains: vendor,
              mode: "insensitive"
            }
          }
        ]
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: input.limit ?? 20
    });
  }
}

function startOfDayUTC(input: Date) {
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 0, 0, 0, 0)
  );
}

function endOfDayUTC(input: Date) {
  return new Date(
    Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 23, 59, 59, 999)
  );
}
