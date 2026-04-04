import {
  Prisma,
  ScopeType,
  SubscriptionBillingPeriod,
  SubscriptionEvidenceReferenceType,
  SubscriptionEvidenceSourceSubtype,
  SubscriptionEvidenceSourceType,
  SubscriptionLifecycleEventType,
  SubscriptionLifecycleState,
  SubscriptionPriceType
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";

const subscriptionListInclude = {
  assignedToUser: {
    select: {
      id: true,
      email: true,
      name: true
    }
  },
  createdByUser: {
    select: {
      id: true,
      email: true,
      name: true
    }
  },
  lastHandledByUser: {
    select: {
      id: true,
      email: true,
      name: true
    }
  },
  _count: {
    select: {
      evidence: true,
      lifecycleEvents: true,
      priceHistory: true,
      obligations: true
    }
  }
} satisfies Prisma.SubscriptionRegistryInclude;

export class SubscriptionRegistryRepository {
  async listForUser(input: {
    userId: string;
    householdIds: string[];
    lifecycleState?: SubscriptionLifecycleState;
    limit: number;
    offset: number;
  }) {
    const where = buildAccessibleWhere({
      userId: input.userId,
      householdIds: input.householdIds,
      lifecycleState: input.lifecycleState
    });

    const [items, total] = await Promise.all([
      prisma.subscriptionRegistry.findMany({
        where,
        include: subscriptionListInclude,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip: input.offset,
        take: input.limit
      }),
      prisma.subscriptionRegistry.count({ where })
    ]);

    return {
      items,
      total
    };
  }

  async findByIdForUser(input: {
    id: string;
    userId: string;
    householdIds: string[];
  }) {
    return prisma.subscriptionRegistry.findFirst({
      where: {
        id: input.id,
        ...buildAccessibleOr({
          userId: input.userId,
          householdIds: input.householdIds
        })
      },
      include: {
        ...subscriptionListInclude,
        evidence: {
          orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
          take: 120
        },
        lifecycleEvents: {
          orderBy: [{ createdAt: "desc" }],
          take: 180
        },
        priceHistory: {
          orderBy: [{ createdAt: "desc" }],
          take: 180
        },
        obligations: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            dueDate: true,
            amount: true,
            currency: true,
            updatedAt: true
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 50
        }
      }
    });
  }

  async findForUserStrict(id: string, userId: string) {
    return prisma.subscriptionRegistry.findFirst({
      where: {
        id,
        userId
      }
    });
  }

  async findPotentialMatches(input: {
    userId: string;
    vendorNormalizedKey: string;
    vendorName: string;
    limit?: number;
  }) {
    return prisma.subscriptionRegistry.findMany({
      where: {
        userId: input.userId,
        OR: [
          {
            vendorNormalizedKey: input.vendorNormalizedKey
          },
          {
            vendorName: {
              equals: input.vendorName,
              mode: "insensitive"
            }
          },
          {
            vendorName: {
              contains: input.vendorName,
              mode: "insensitive"
            }
          }
        ]
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: input.limit ?? 20
    });
  }

  async createSubscription(data: Prisma.SubscriptionRegistryUncheckedCreateInput) {
    return prisma.subscriptionRegistry.create({
      data
    });
  }

  async updateSubscription(
    id: string,
    data: Prisma.SubscriptionRegistryUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? prisma;
    return db.subscriptionRegistry.update({
      where: { id },
      data
    });
  }

  async findEvidenceByReference(input: {
    subscriptionId: string;
    referenceType: SubscriptionEvidenceReferenceType;
    referenceId: string;
  }, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;
    return db.subscriptionEvidence.findFirst({
      where: {
        subscriptionId: input.subscriptionId,
        referenceType: input.referenceType,
        referenceId: input.referenceId
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async createEvidence(
    data: {
      subscriptionId: string;
      sourceType: SubscriptionEvidenceSourceType;
      sourceSubType?: SubscriptionEvidenceSourceSubtype | null;
      referenceType: SubscriptionEvidenceReferenceType;
      referenceId: string;
      signalSummary?: Prisma.InputJsonValue;
      confidenceScore: number;
      observedAt: Date;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? prisma;
    return db.subscriptionEvidence.create({
      data: {
        subscriptionId: data.subscriptionId,
        sourceType: data.sourceType,
        sourceSubType: data.sourceSubType ?? null,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        signalSummary: data.signalSummary,
        confidenceScore: data.confidenceScore,
        observedAt: data.observedAt
      }
    });
  }

  async createLifecycleEvent(
    data: {
      subscriptionId: string;
      eventType: SubscriptionLifecycleEventType;
      previousState?: SubscriptionLifecycleState | null;
      nextState?: SubscriptionLifecycleState | null;
      eventDate?: Date | null;
      metadata?: Prisma.InputJsonValue;
      sourceEvidenceId?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? prisma;
    return db.subscriptionLifecycleEvent.create({
      data: {
        subscriptionId: data.subscriptionId,
        eventType: data.eventType,
        previousState: data.previousState ?? null,
        nextState: data.nextState ?? null,
        eventDate: data.eventDate ?? null,
        metadata: data.metadata,
        sourceEvidenceId: data.sourceEvidenceId ?? null
      }
    });
  }

  async createPriceHistory(
    data: {
      subscriptionId: string;
      priceType: SubscriptionPriceType;
      amount: number;
      currency: string;
      billingPeriod?: SubscriptionBillingPeriod | null;
      effectiveDate?: Date | null;
      sourceEvidenceId?: string | null;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? prisma;
    return db.subscriptionPriceHistory.create({
      data: {
        subscriptionId: data.subscriptionId,
        priceType: data.priceType,
        amount: data.amount,
        currency: data.currency,
        billingPeriod: data.billingPeriod ?? null,
        effectiveDate: data.effectiveDate ?? null,
        sourceEvidenceId: data.sourceEvidenceId ?? null
      }
    });
  }

  async attachObligationToSubscription(input: {
    obligationId: string;
    userId: string;
    subscriptionId: string;
  }, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;
    return db.obligation.updateMany({
      where: {
        id: input.obligationId,
        userId: input.userId
      },
      data: {
        subscriptionId: input.subscriptionId
      }
    });
  }

  async moveMergeRelations(input: {
    primaryId: string;
    duplicateId: string;
  }, tx?: Prisma.TransactionClient) {
    const db = tx ?? prisma;
    await Promise.all([
      db.subscriptionEvidence.updateMany({
        where: { subscriptionId: input.duplicateId },
        data: { subscriptionId: input.primaryId }
      }),
      db.subscriptionLifecycleEvent.updateMany({
        where: { subscriptionId: input.duplicateId },
        data: { subscriptionId: input.primaryId }
      }),
      db.subscriptionPriceHistory.updateMany({
        where: { subscriptionId: input.duplicateId },
        data: { subscriptionId: input.primaryId }
      }),
      db.obligation.updateMany({
        where: { subscriptionId: input.duplicateId },
        data: { subscriptionId: input.primaryId }
      })
    ]);
  }

  async runInTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ) {
    return prisma.$transaction((tx) => callback(tx));
  }

  async createAuditEvent(input: {
    userId: string;
    obligationId?: string | null;
    eventType: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return createAuditEvent({
      userId: input.userId,
      obligationId: input.obligationId ?? null,
      eventType: input.eventType,
      metadata: input.metadata
    });
  }
}

function buildAccessibleWhere(input: {
  userId: string;
  householdIds: string[];
  lifecycleState?: SubscriptionLifecycleState;
}) {
  return {
    ...buildAccessibleOr({
      userId: input.userId,
      householdIds: input.householdIds
    }),
    ...(input.lifecycleState
      ? {
          lifecycleState: input.lifecycleState
        }
      : {})
  } satisfies Prisma.SubscriptionRegistryWhereInput;
}

function buildAccessibleOr(input: {
  userId: string;
  householdIds: string[];
}) {
  const householdFilter =
    input.householdIds.length > 0
      ? {
          scopeType: ScopeType.HOUSEHOLD,
          householdId: {
            in: input.householdIds
          }
        }
      : null;

  return {
    OR: [
      {
        userId: input.userId,
        scopeType: ScopeType.PERSONAL
      },
      ...(householdFilter ? [householdFilter] : [])
    ]
  } satisfies Prisma.SubscriptionRegistryWhereInput;
}
