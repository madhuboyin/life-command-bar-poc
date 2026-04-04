import {
  AutonomyDecision,
  ObligationStatus,
  PredictionType,
  Prisma,
  ZeroInputActionType,
  ZeroInputApprovalStatus,
  ZeroInputAutonomyTier,
  ZeroInputDecision
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";

const obligationSourceInclude = {
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
} satisfies Prisma.ObligationInclude;

const autonomyDecisionInclude = {
  obligation: {
    include: obligationSourceInclude
  },
  prediction: {
    include: {
      promotedObligation: {
        include: obligationSourceInclude
      }
    }
  },
  reminder: true
} satisfies Prisma.AutonomyDecisionInclude;

export type AutonomyDecisionWithRelations = Prisma.AutonomyDecisionGetPayload<{
  include: typeof autonomyDecisionInclude;
}>;

type DbClient = Prisma.TransactionClient | typeof prisma;

export class ZeroInputRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async getPolicy(userId: string) {
    return prisma.zeroInputPolicy.findUnique({
      where: {
        userId
      }
    });
  }

  async upsertPolicy(
    userId: string,
    data: Partial<{
      modeEnabled: boolean;
      autonomyTier: ZeroInputAutonomyTier;
      allowRecurringPromotion: boolean;
      allowReminderAutocreate: boolean;
      allowDuplicateSuppression: boolean;
      allowAutoFlowPreparation: boolean;
      allowPredictionPromotion: boolean;
      requireApprovalForFinancialItems: boolean;
      requireApprovalForLowConfidence: boolean;
      quietHoursStart: string | null;
      quietHoursEnd: string | null;
    }>
  ) {
    return prisma.zeroInputPolicy.upsert({
      where: {
        userId
      },
      create: {
        userId,
        ...data
      },
      update: {
        ...data
      }
    });
  }

  async createDecision(
    input: {
      userId: string;
      obligationId?: string | null;
      predictionId?: string | null;
      reminderId?: string | null;
      sourceType: string;
      referenceType: string;
      referenceId?: string | null;
      candidateAction: ZeroInputActionType;
      decision: ZeroInputDecision;
      approvalStatus?: ZeroInputApprovalStatus;
      title: string;
      description?: string | null;
      rationale?: Prisma.InputJsonValue;
      confidenceScore?: number;
      guardrailResults?: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
      executedAt?: Date | null;
      approvedAt?: Date | null;
      rejectedAt?: Date | null;
      undoneAt?: Date | null;
      undoReason?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.autonomyDecision.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId ?? null,
        predictionId: input.predictionId ?? null,
        reminderId: input.reminderId ?? null,
        sourceType: input.sourceType,
        referenceType: input.referenceType,
        referenceId: input.referenceId ?? null,
        candidateAction: input.candidateAction,
        decision: input.decision,
        approvalStatus: input.approvalStatus ?? ZeroInputApprovalStatus.NONE,
        title: input.title,
        description: input.description ?? null,
        rationale: input.rationale,
        confidenceScore: input.confidenceScore ?? 0,
        guardrailResults: input.guardrailResults,
        metadata: input.metadata,
        executedAt: input.executedAt ?? null,
        approvedAt: input.approvedAt ?? null,
        rejectedAt: input.rejectedAt ?? null,
        undoneAt: input.undoneAt ?? null,
        undoReason: input.undoReason ?? null
      },
      include: autonomyDecisionInclude
    });
  }

  async updateDecision(
    id: string,
    data: Prisma.AutonomyDecisionUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.autonomyDecision.update({
      where: { id },
      data,
      include: autonomyDecisionInclude
    });
  }

  async findDecisionByIdForUser(userId: string, id: string) {
    return prisma.autonomyDecision.findFirst({
      where: {
        userId,
        id
      },
      include: autonomyDecisionInclude
    });
  }

  async listDecisions(input: {
    userId: string;
    limit?: number;
    decision?: ZeroInputDecision[];
    approvalStatus?: ZeroInputApprovalStatus[];
  }) {
    return prisma.autonomyDecision.findMany({
      where: {
        userId: input.userId,
        decision: input.decision
          ? {
              in: input.decision
            }
          : undefined,
        approvalStatus: input.approvalStatus
          ? {
              in: input.approvalStatus
            }
          : undefined
      },
      include: autonomyDecisionInclude,
      orderBy: [{ createdAt: "desc" }],
      take: input.limit ?? 50
    });
  }

  async findOpenDecisionByReference(input: {
    userId: string;
    candidateAction: ZeroInputActionType;
    referenceType: string;
    referenceId?: string | null;
  }) {
    if (!input.referenceId) return null;

    return prisma.autonomyDecision.findFirst({
      where: {
        userId: input.userId,
        candidateAction: input.candidateAction,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        decision: ZeroInputDecision.APPROVAL_REQUIRED,
        approvalStatus: ZeroInputApprovalStatus.PENDING
      },
      include: autonomyDecisionInclude,
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async findRecentDecisionByReference(input: {
    userId: string;
    candidateAction: ZeroInputActionType;
    referenceType: string;
    referenceId?: string | null;
    since: Date;
  }) {
    if (!input.referenceId) return null;

    return prisma.autonomyDecision.findFirst({
      where: {
        userId: input.userId,
        candidateAction: input.candidateAction,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        createdAt: {
          gte: input.since
        }
      },
      include: autonomyDecisionInclude,
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async listPendingApprovals(userId: string, limit = 30) {
    return prisma.autonomyDecision.findMany({
      where: {
        userId,
        decision: ZeroInputDecision.APPROVAL_REQUIRED,
        approvalStatus: ZeroInputApprovalStatus.PENDING
      },
      include: autonomyDecisionInclude,
      orderBy: [{ createdAt: "desc" }],
      take: limit
    });
  }

  async findObligationByIdForUser(userId: string, obligationId: string) {
    return prisma.obligation.findFirst({
      where: {
        userId,
        id: obligationId
      },
      include: obligationSourceInclude
    });
  }

  async updateObligationForUser(input: {
    userId: string;
    obligationId: string;
    data: Prisma.ObligationUncheckedUpdateInput;
  }, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);
    const existing = await db.obligation.findFirst({
      where: {
        id: input.obligationId,
        userId: input.userId
      },
      select: { id: true }
    });
    if (!existing) return null;

    return db.obligation.update({
      where: {
        id: input.obligationId
      },
      data: input.data,
      include: obligationSourceInclude
    });
  }

  async findSimilarOpenObligation(input: {
    userId: string;
    vendor?: string | null;
    title?: string | null;
    dueDate?: Date | null;
    windowDays?: number;
  }) {
    const window = input.windowDays ?? 7;
    const dueFrom = input.dueDate
      ? new Date(input.dueDate.getTime() - window * 24 * 60 * 60 * 1000)
      : null;
    const dueTo = input.dueDate
      ? new Date(input.dueDate.getTime() + window * 24 * 60 * 60 * 1000)
      : null;

    return prisma.obligation.findFirst({
      where: {
        userId: input.userId,
        status: {
          in: [ObligationStatus.DRAFT, ObligationStatus.ACTIVE, ObligationStatus.POSTPONED]
        },
        OR: [
          input.vendor
            ? {
                vendor: {
                  equals: input.vendor,
                  mode: "insensitive"
                }
              }
            : undefined,
          input.title
            ? {
                title: {
                  equals: input.title,
                  mode: "insensitive"
                }
              }
            : undefined
        ].filter(Boolean) as Prisma.ObligationWhereInput[],
        dueDate:
          dueFrom && dueTo
            ? {
                gte: dueFrom,
                lte: dueTo
              }
            : undefined
      },
      include: obligationSourceInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }]
    });
  }

  async findPredictionByIdForUser(userId: string, predictionId: string) {
    return prisma.prediction.findFirst({
      where: {
        userId,
        id: predictionId
      },
      include: {
        promotedObligation: {
          include: obligationSourceInclude
        }
      }
    });
  }

  async listActiveRecurringPredictions(userId: string, limit = 60) {
    return prisma.prediction.findMany({
      where: {
        userId,
        status: "ACTIVE",
        predictionType: {
          in: [
            PredictionType.RECURRING_NEXT_OCCURRENCE,
            PredictionType.MISSING_EXPECTED_OBLIGATION
          ]
        }
      },
      include: {
        promotedObligation: {
          include: obligationSourceInclude
        }
      },
      orderBy: [{ confidenceScore: "desc" }, { predictedDate: "asc" }, { createdAt: "desc" }],
      take: limit
    });
  }

  async findExistingUpcomingReminder(input: {
    userId: string;
    obligationId?: string | null;
    title?: string | null;
    windowStart: Date;
    windowEnd: Date;
  }) {
    return prisma.reminder.findFirst({
      where: {
        userId: input.userId,
        status: {
          in: ["SCHEDULED", "TRIGGERED"]
        },
        scheduledFor: {
          gte: input.windowStart,
          lte: input.windowEnd
        },
        OR: [
          input.obligationId
            ? {
                obligationId: input.obligationId
              }
            : undefined,
          input.title
            ? {
                title: {
                  equals: input.title,
                  mode: "insensitive"
                }
              }
            : undefined
        ].filter(Boolean) as Prisma.ReminderWhereInput[]
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async createReminder(input: {
    userId: string;
    obligationId?: string | null;
    title: string;
    scheduledFor: Date;
  }, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);
    return db.reminder.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId ?? null,
        title: input.title,
        scheduledFor: input.scheduledFor,
        status: "SCHEDULED"
      }
    });
  }

  async updateReminder(reminderId: string, data: Prisma.ReminderUncheckedUpdateInput, tx?: Prisma.TransactionClient) {
    const db = getDb(tx);
    return db.reminder.update({
      where: {
        id: reminderId
      },
      data
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
        obligationId: input.obligationId ?? null,
        eventType: input.eventType,
        metadata: input.metadata
      },
      db
    );
  }

  async createFeedbackEvent(
    input: {
      userId: string;
      obligationId?: string | null;
      type: "DONT_SHOW_AGAIN" | "WRONG_INFO" | "REJECTED";
      note?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(tx);
    return db.feedbackEvent.create({
      data: {
        userId: input.userId,
        obligationId: input.obligationId ?? null,
        type: input.type,
        note: input.note ?? null
      }
    });
  }

  async hasRecentCorrectionForVendor(input: {
    userId: string;
    vendor: string;
    days: number;
  }) {
    const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
    const count = await prisma.auditEvent.count({
      where: {
        userId: input.userId,
        eventType: {
          in: ["obligation_corrected", "ingestion_candidate_rejected"]
        },
        createdAt: {
          gte: since
        },
        obligation: {
          vendor: {
            equals: input.vendor,
            mode: "insensitive"
          }
        }
      }
    });

    return count > 0;
  }

  async listDecisionsForObligation(userId: string, obligationId: string, limit = 20) {
    return prisma.autonomyDecision.findMany({
      where: {
        userId,
        obligationId
      },
      include: autonomyDecisionInclude,
      orderBy: [{ createdAt: "desc" }],
      take: limit
    });
  }
}

function getDb(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? prisma;
}

export function toDecisionSourceType(input: { channel?: string | null; sourceType?: string | null }) {
  if (input.channel) return `ingestion:${input.channel}`;
  if (input.sourceType) return input.sourceType;
  return "system";
}

export type ZeroInputDecisionRow = AutonomyDecision;
