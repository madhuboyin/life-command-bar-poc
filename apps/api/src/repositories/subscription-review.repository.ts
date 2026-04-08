import { Prisma, ScopeType, type SubscriptionLifecycleState } from "@prisma/client";
import { prisma } from "../clients/prisma.client";

type AccessibleInput = {
  userId: string;
  householdIds: string[];
};

const subscriptionReviewListInclude = {
  assignedToUser: {
    select: {
      id: true,
      email: true,
      name: true
    }
  },
  recommendation: true,
  insights: true,
  _count: {
    select: {
      evidence: true,
      lifecycleEvents: true,
      priceHistory: true,
      obligations: true
    }
  }
} satisfies Prisma.SubscriptionRegistryInclude;

export type SubscriptionReviewListRecord = Prisma.SubscriptionRegistryGetPayload<{
  include: typeof subscriptionReviewListInclude;
}>;

export type SubscriptionReviewDetailRecord = Prisma.SubscriptionRegistryGetPayload<{
  include: {
    assignedToUser: {
      select: {
        id: true;
        email: true;
        name: true;
      };
    };
    lastHandledByUser: {
      select: {
        id: true;
        email: true;
        name: true;
      };
    };
    recommendation: true;
    insights: true;
    evidence: {
      orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }];
      take: 120;
    };
    lifecycleEvents: {
      orderBy: [{ createdAt: "desc" }];
      take: 180;
    };
    priceHistory: {
      orderBy: [{ createdAt: "desc" }];
      take: 180;
    };
    obligations: {
      select: {
        id: true;
        title: true;
        status: true;
        type: true;
        dueDate: true;
        amount: true;
        currency: true;
        updatedAt: true;
      };
      orderBy: [{ updatedAt: "desc" }];
      take: 50;
    };
  };
}>;

export class SubscriptionReviewRepository {
  async listAccessibleSubscriptions(input: {
    userId: string;
    householdIds: string[];
    lifecycleState?: SubscriptionLifecycleState;
  }) {
    return prisma.subscriptionRegistry.findMany({
      where: {
        ...buildAccessibleWhere({
          userId: input.userId,
          householdIds: input.householdIds
        }),
        lifecycleState: input.lifecycleState
      },
      include: subscriptionReviewListInclude
    });
  }

  async findDetailById(input: {
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
        assignedToUser: {
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
        recommendation: true,
        insights: true,
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

  async listRecentAuditEvents(input: {
    userId: string;
    eventTypes: string[];
    since?: Date;
    limit?: number;
  }) {
    return prisma.auditEvent.findMany({
      where: {
        userId: input.userId,
        eventType: {
          in: input.eventTypes
        },
        createdAt: input.since
          ? {
              gte: input.since
            }
          : undefined
      },
      select: {
        id: true,
        eventType: true,
        metadata: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "desc"
      },
      take: input.limit ?? 500
    });
  }

  async findMostRecentLinkedObligation(input: {
    subscriptionId: string;
  }) {
    return prisma.obligation.findFirst({
      where: {
        subscriptionId: input.subscriptionId,
        status: {
          in: ["ACTIVE", "POSTPONED", "DRAFT"]
        }
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });
  }
}

function buildAccessibleWhere(input: AccessibleInput) {
  return {
    OR: [
      {
        userId: input.userId,
        scopeType: ScopeType.PERSONAL
      },
      ...(input.householdIds.length > 0
        ? [
            {
              scopeType: ScopeType.HOUSEHOLD,
              householdId: {
                in: input.householdIds
              }
            }
          ]
        : [])
    ]
  } satisfies Prisma.SubscriptionRegistryWhereInput;
}

function buildAccessibleOr(input: AccessibleInput) {
  return {
    OR: [
      {
        userId: input.userId,
        scopeType: ScopeType.PERSONAL
      },
      ...(input.householdIds.length > 0
        ? [
            {
              scopeType: ScopeType.HOUSEHOLD,
              householdId: {
                in: input.householdIds
              }
            }
          ]
        : [])
    ]
  } satisfies Prisma.SubscriptionRegistryWhereInput;
}
