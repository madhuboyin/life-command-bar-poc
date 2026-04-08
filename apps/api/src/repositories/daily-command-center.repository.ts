import { ObligationStatus, Prisma, ScopeType } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";

const obligationInclude = {
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
  },
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
  subscription: {
    select: {
      id: true,
      subscriptionTitle: true,
      vendorName: true,
      lifecycleState: true,
      nextRenewalDate: true,
      recurringPrice: true,
      currency: true,
      sourceConfidenceBand: true,
      scopeType: true,
      assignedToUser: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  }
} satisfies Prisma.ObligationInclude;

type ListOpenInput = {
  userId: string;
  limit?: number;
};

type ListCompletedInput = {
  userId: string;
  from: Date;
  limit?: number;
};

export class DailyCommandCenterRepository {
  async listOpenCandidates(input: ListOpenInput) {
    const householdIds = await listActiveHouseholdIdsForUser(input.userId);

    return prisma.obligation.findMany({
      where: {
        AND: [
          buildVisibilityWhere(input.userId, householdIds),
          {
            status: {
              in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED]
            }
          }
        ]
      },
      include: obligationInclude,
      orderBy: [{ dueDate: "asc" }, { urgencyScore: "desc" }, { updatedAt: "desc" }],
      take: input.limit ?? 180
    });
  }

  async listCompletedOrSafeToday(input: ListCompletedInput) {
    const householdIds = await listActiveHouseholdIdsForUser(input.userId);

    return prisma.obligation.findMany({
      where: {
        AND: [
          buildVisibilityWhere(input.userId, householdIds),
          {
            OR: [
              {
                status: {
                  in: [ObligationStatus.RESOLVED, ObligationStatus.IGNORED]
                },
                lastActedAt: {
                  gte: input.from
                }
              },
              {
                status: ObligationStatus.POSTPONED,
                lastActedAt: {
                  gte: input.from
                }
              }
            ]
          }
        ]
      },
      include: obligationInclude,
      orderBy: [{ lastActedAt: "desc" }, { updatedAt: "desc" }],
      take: input.limit ?? 24
    });
  }

  async findByIdForUser(userId: string, obligationId: string) {
    const householdIds = await listActiveHouseholdIdsForUser(userId);

    return prisma.obligation.findFirst({
      where: {
        id: obligationId,
        AND: [buildVisibilityWhere(userId, householdIds)]
      },
      include: obligationInclude
    });
  }
}

function buildVisibilityWhere(userId: string, householdIds: string[]): Prisma.ObligationWhereInput {
  const visibleScopes: Prisma.ObligationWhereInput[] = [
    {
      scopeType: ScopeType.PERSONAL,
      userId
    }
  ];

  if (householdIds.length > 0) {
    visibleScopes.push({
      scopeType: ScopeType.HOUSEHOLD,
      householdId: {
        in: householdIds
      }
    });
  }

  return {
    OR: visibleScopes
  };
}
