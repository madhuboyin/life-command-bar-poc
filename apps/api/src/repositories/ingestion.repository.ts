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
    return prisma.auditEvent.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId,
        eventType: input.eventType,
        metadata: input.metadata
      }
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
}
