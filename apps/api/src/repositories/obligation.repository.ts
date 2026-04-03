import { ObligationStatus, ObligationType, Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { CreateObligationInput, ObligationListQuery } from "../types/obligation.types";

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
        orderBy: [
          { dueDate: "asc" },
          { createdAt: "desc" }
        ],
        skip: offset,
        take: limit
      }),
      prisma.obligation.count({ where })
    ]);

    return { items, total, limit, offset };
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
    return prisma.obligation.create({
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
}
