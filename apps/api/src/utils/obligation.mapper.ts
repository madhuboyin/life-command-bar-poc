import { Obligation, Prisma } from "@prisma/client";

type ObligationWithRelations = Obligation;

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? Number(value) : null;
}

export function mapObligation(obligation: ObligationWithRelations) {
  return {
    id: obligation.id,
    userId: obligation.userId,
    type: obligation.type,
    title: obligation.title,
    description: obligation.description,
    vendor: obligation.vendor,
    amount: decimalToNumber(obligation.amount),
    currency: obligation.currency,
    dueDate: obligation.dueDate?.toISOString() ?? null,
    recurrence: obligation.recurrence,
    source: obligation.source,
    confidenceScore: Number(obligation.confidenceScore),
    urgencyScore: Number(obligation.urgencyScore),
    importanceScore: Number(obligation.importanceScore),
    effortLevel: obligation.effortLevel,
    impactLevel: obligation.impactLevel,
    status: obligation.status,
    lastShownAt: obligation.lastShownAt?.toISOString() ?? null,
    lastActedAt: obligation.lastActedAt?.toISOString() ?? null,
    createdAt: obligation.createdAt.toISOString(),
    updatedAt: obligation.updatedAt.toISOString()
  };
}
