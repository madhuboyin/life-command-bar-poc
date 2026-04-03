import { ObligationStatus, ObligationType, Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import {
  CreateObligationInput,
  ObligationListQuery,
  UpdateObligationInput
} from "../types/obligation.types";

export class ObligationRepository {
  async findMany(query: ObligationListQuery & { userId: string }) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const where: Prisma.ObligationWhereInput = {
      userId: query.userId
    };

    if (query.status) {
      where.status = query.status as ObligationStatus;
    }

    if (query.type) {
      where.type = query.type as ObligationType;
    }

    const [items, total] = await Promise.all([
      prisma.obligation.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip: offset,
        take: limit
      }),
      prisma.obligation.count({ where })
    ]);

    return { items, total, limit, offset };
  }

  async findActiveForFeed(userId: string) {
    return prisma.obligation.findMany({
      where: {
        userId,
        status: {
          in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED]
        }
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  async findById(id: string, userId: string) {
    return prisma.obligation.findFirst({
      where: {
        id,
        userId
      }
    });
  }

  async create(input: CreateObligationInput) {
    const obligation = await prisma.obligation.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        description: input.description,
        vendor: input.vendor,
        amount: input.amount,
        currency: input.currency ?? "USD",
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        recurrence: input.recurrence,
        source: input.source ?? "MANUAL",
        confidenceScore: input.confidenceScore ?? 0.95,
        urgencyScore: input.urgencyScore ?? 50,
        importanceScore: input.importanceScore ?? 50,
        effortLevel: input.effortLevel ?? "MEDIUM",
        impactLevel: input.impactLevel ?? "MEDIUM",
        status: input.status ?? "ACTIVE"
      }
    });

    await prisma.auditEvent.create({
      data: {
        userId: input.userId,
        obligationId: obligation.id,
        eventType: "obligation_created",
        metadata: {
          title: input.title,
          type: input.type
        }
      }
    });

    return obligation;
  }

  async update(id: string, userId: string, input: UpdateObligationInput) {
    const existing = await this.findById(id, userId);
    if (!existing) return null;

    const obligation = await prisma.obligation.update({
      where: { id },
      data: {
        type: input.type,
        title: input.title,
        description: input.description,
        vendor: input.vendor,
        amount: input.amount,
        currency: input.currency,
        dueDate: input.dueDate ? new Date(input.dueDate) : input.dueDate === null ? null : undefined,
        recurrence: input.recurrence,
        source: input.source,
        confidenceScore: input.confidenceScore,
        urgencyScore: input.urgencyScore,
        importanceScore: input.importanceScore,
        effortLevel: input.effortLevel,
        impactLevel: input.impactLevel,
        status: input.status
      }
    });

    await prisma.auditEvent.create({
      data: {
        userId,
        obligationId: id,
        eventType: "obligation_updated",
        metadata: toAuditMetadata(input)
      }
    });

    return obligation;
  }

  async updateLastShownAt(ids: string[]) {
    if (ids.length === 0) return;

    await prisma.obligation.updateMany({
      where: {
        id: { in: ids }
      },
      data: {
        lastShownAt: new Date()
      }
    });
  }

  async markDone(id: string, userId: string, note?: string) {
    const obligation = await prisma.obligation.updateMany({
      where: {
        id,
        userId
      },
      data: {
        status: ObligationStatus.RESOLVED,
        lastActedAt: new Date()
      }
    });

    if (obligation.count === 0) return null;

    await prisma.auditEvent.create({
      data: {
        userId,
        obligationId: id,
        eventType: "obligation_marked_done",
        metadata: { note: note ?? null }
      }
    });

    return this.findById(id, userId);
  }

  async dismiss(id: string, userId: string, reason?: string) {
    const obligation = await prisma.obligation.updateMany({
      where: {
        id,
        userId
      },
      data: {
        status: ObligationStatus.IGNORED,
        lastActedAt: new Date()
      }
    });

    if (obligation.count === 0) return null;

    await prisma.auditEvent.create({
      data: {
        userId,
        obligationId: id,
        eventType: "obligation_dismissed",
        metadata: { reason: reason ?? null }
      }
    });

    return this.findById(id, userId);
  }

  async postpone(id: string, userId: string, until?: string, reason?: string) {
    const data: Prisma.ObligationUpdateManyMutationInput = {
      status: ObligationStatus.POSTPONED,
      lastActedAt: new Date()
    };

    if (until) {
      data.dueDate = new Date(until);
    }

    const result = await prisma.obligation.updateMany({
      where: {
        id,
        userId
      },
      data
    });

    if (result.count === 0) return null;

    await prisma.auditEvent.create({
      data: {
        userId,
        obligationId: id,
        eventType: "obligation_postponed",
        metadata: {
          until: until ?? null,
          reason: reason ?? null
        }
      }
    });

    return this.findById(id, userId);
  }

  async getHistory(id: string, userId: string) {
    const [auditEvents, feedbackEvents, resolutionRuns, reminders] = await Promise.all([
      prisma.auditEvent.findMany({
        where: { obligationId: id, userId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.feedbackEvent.findMany({
        where: { obligationId: id, userId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.resolutionRun.findMany({
        where: { obligationId: id, userId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.reminder.findMany({
        where: { obligationId: id, userId },
        orderBy: { createdAt: "desc" }
      })
    ]);

    return {
      auditEvents,
      feedbackEvents,
      resolutionRuns,
      reminders
    };
  }
}

function toAuditMetadata(input: UpdateObligationInput): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Prisma.InputJsonObject;
}
