import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  LlmCallStatus,
  MetricTimeBucket,
  ObligationStatus,
  Prisma,
  PredictionStatus,
  ScopeType,
  ZeroInputApprovalStatus,
  ZeroInputDecision
} from "@prisma/client";
import { prisma as prismaClient } from "../clients/prisma.client";

type ScopeFilters = {
  userId?: string;
  householdId?: string;
};

export class MetricsRepository {
  async countObservabilityEvents(input: {
    eventType: string;
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.observabilityEvent.count({
      where: {
        eventType: input.eventType,
        timestamp: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        householdId: input.filters?.householdId
      }
    });
  }

  async countAuditEvents(input: {
    eventTypes: string[];
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.auditEvent.count({
      where: {
        eventType: {
          in: input.eventTypes
        },
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        householdId: input.filters?.householdId
      }
    });
  }

  async countImportSources(input: {
    start: Date;
    end: Date;
    minConfidence?: number;
    maxConfidence?: number;
    filters?: ScopeFilters;
  }) {
    return prismaClient.importSource.count({
      where: {
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        parseConfidence:
          input.minConfidence !== undefined || input.maxConfidence !== undefined
            ? {
                gte: input.minConfidence,
                lt: input.maxConfidence
              }
            : undefined
      }
    });
  }

  async countPredictionsCreated(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.prediction.count({
      where: {
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        householdId: input.filters?.householdId
      }
    });
  }

  async getPredictionConfidenceAverages(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    const [positive, negative] = await Promise.all([
      prismaClient.prediction.aggregate({
        where: {
          updatedAt: {
            gte: input.start,
            lt: input.end
          },
          status: {
            in: [PredictionStatus.CONFIRMED, PredictionStatus.PROMOTED_TO_OBLIGATION]
          },
          userId: input.filters?.userId,
          householdId: input.filters?.householdId
        },
        _avg: {
          confidenceScore: true
        }
      }),
      prismaClient.prediction.aggregate({
        where: {
          updatedAt: {
            gte: input.start,
            lt: input.end
          },
          status: PredictionStatus.DISMISSED,
          userId: input.filters?.userId,
          householdId: input.filters?.householdId
        },
        _avg: {
          confidenceScore: true
        }
      })
    ]);

    return {
      positiveAvg: Number(positive._avg.confidenceScore ?? 0),
      negativeAvg: Number(negative._avg.confidenceScore ?? 0)
    };
  }

  async countAutoFlowCreated(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.autoFlowState.count({
      where: {
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        obligation: input.filters?.householdId
          ? {
              householdId: input.filters.householdId
            }
          : undefined
      }
    });
  }

  async getAutoFlowAcceptedDurationsMs(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    const rows = await prismaClient.autoFlowState.findMany({
      where: {
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        acceptedAt: {
          not: null
        },
        userId: input.filters?.userId,
        obligation: input.filters?.householdId
          ? {
              householdId: input.filters.householdId
            }
          : undefined
      },
      select: {
        createdAt: true,
        acceptedAt: true
      }
    });

    return rows
      .map((row) => {
        if (!row.acceptedAt) return null;
        return row.acceptedAt.getTime() - row.createdAt.getTime();
      })
      .filter((value): value is number => typeof value === "number" && value >= 0);
  }

  async countGuidedJourneys(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.guidedJourney.count({
      where: {
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        obligation: input.filters?.householdId
          ? {
              householdId: input.filters.householdId
            }
          : undefined
      }
    });
  }

  async countGuidedCompletedSteps(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.guidedJourneyStep.count({
      where: {
        isCompleted: true,
        journey: {
          createdAt: {
            gte: input.start,
            lt: input.end
          },
          userId: input.filters?.userId,
          obligation: input.filters?.householdId
            ? {
                householdId: input.filters.householdId
              }
            : undefined
        }
      }
    });
  }

  async listGuidedStepCompletedEvents(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
    limit?: number;
  }) {
    return prismaClient.guidedJourneyEvent.findMany({
      where: {
        eventType: "STEP_COMPLETED",
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        obligation: input.filters?.householdId
          ? {
              householdId: input.filters.householdId
            }
          : undefined
      },
      select: {
        metadata: true
      },
      take: input.limit ?? 5000,
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  async countFlowSessions(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.flowSession.count({
      where: {
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        currentObligation: input.filters?.householdId
          ? {
              householdId: input.filters.householdId
            }
          : undefined
      }
    });
  }

  async countFocusSessions(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    return prismaClient.focusSession.count({
      where: {
        createdAt: {
          gte: input.start,
          lt: input.end
        },
        userId: input.filters?.userId,
        items: input.filters?.householdId
          ? {
              some: {
                obligation: {
                  householdId: input.filters.householdId
                }
              }
            }
          : undefined
      }
    });
  }

  async getLlmUsageSummary(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    const where: Prisma.LlmUsageRecordWhereInput = {
      createdAt: {
        gte: input.start,
        lt: input.end
      },
      userId: input.filters?.userId,
      householdId: input.filters?.householdId
    };

    const [
      totalRequests,
      completedCount,
      failedCount,
      skippedCount,
      cacheHitCount,
      gateSkippedCount,
      aggregate,
      tierGroups,
      asyncEnqueuedCount,
      gmailTaskCount
    ] = await Promise.all([
      prismaClient.llmUsageRecord.count({ where }),
      prismaClient.llmUsageRecord.count({
        where: {
          ...where,
          status: LlmCallStatus.COMPLETED
        }
      }),
      prismaClient.llmUsageRecord.count({
        where: {
          ...where,
          status: LlmCallStatus.FAILED
        }
      }),
      prismaClient.llmUsageRecord.count({
        where: {
          ...where,
          status: LlmCallStatus.SKIPPED
        }
      }),
      prismaClient.llmUsageRecord.count({
        where: {
          ...where,
          cacheHit: true
        }
      }),
      prismaClient.llmUsageRecord.count({
        where: {
          ...where,
          gateSkipped: true
        }
      }),
      prismaClient.llmUsageRecord.aggregate({
        where,
        _sum: {
          estimatedCostUsd: true
        },
        _avg: {
          latencyMs: true
        }
      }),
      prismaClient.llmUsageRecord.groupBy({
        by: ["modelTier"],
        where,
        _count: {
          _all: true
        }
      }),
      prismaClient.llmAsyncTask.count({
        where: {
          createdAt: {
            gte: input.start,
            lt: input.end
          },
          userId: input.filters?.userId,
          householdId: input.filters?.householdId
        }
      }),
      prismaClient.llmUsageRecord.count({
        where: {
          ...where,
          taskType: {
            in: ["GMAIL_COMPLEX_EXTRACTION", "GMAIL_LIFECYCLE_CONFLICT_RESOLUTION"]
          }
        }
      })
    ]);

    return {
      totalRequests,
      completedCount,
      failedCount,
      skippedCount,
      cacheHitCount,
      gateSkippedCount,
      asyncEnqueuedCount,
      gmailTaskCount,
      estimatedCostUsd: Number(aggregate._sum.estimatedCostUsd ?? 0),
      avgLatencyMs: Number(aggregate._avg.latencyMs ?? 0),
      tierCounts: {
        TIER_LOW_COST:
          tierGroups.find((entry) => entry.modelTier === "TIER_LOW_COST")?._count._all ?? 0,
        TIER_REASONING:
          tierGroups.find((entry) => entry.modelTier === "TIER_REASONING")?._count._all ?? 0,
        TIER_PREMIUM:
          tierGroups.find((entry) => entry.modelTier === "TIER_PREMIUM")?._count._all ?? 0
      }
    };
  }

  async countReviewQueue(filters?: ScopeFilters) {
    return prismaClient.obligation.count({
      where: {
        userId: filters?.userId,
        householdId: filters?.householdId,
        importSourceId: {
          not: null
        },
        OR: [
          {
            status: ObligationStatus.DRAFT
          },
          {
            confidenceScore: {
              lt: 0.78
            }
          },
          {
            importSource: {
              parseStatus: {
                in: ["PARTIAL", "NEEDS_CONFIRMATION", "FAILED"]
              }
            }
          }
        ]
      }
    });
  }

  async countApprovalQueue(filters?: ScopeFilters) {
    return prismaClient.autonomyDecision.count({
      where: {
        userId: filters?.userId,
        householdId: filters?.householdId,
        decision: ZeroInputDecision.APPROVAL_REQUIRED,
        approvalStatus: ZeroInputApprovalStatus.PENDING
      }
    });
  }

  async getHouseholdAssignmentStats(filters?: ScopeFilters) {
    const where: Prisma.ObligationWhereInput = {
      scopeType: ScopeType.HOUSEHOLD,
      status: {
        in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED, ObligationStatus.DRAFT]
      },
      userId: filters?.userId,
      householdId: filters?.householdId
    };

    const [total, unclaimed, assigned] = await Promise.all([
      prismaClient.obligation.count({ where }),
      prismaClient.obligation.count({
        where: {
          ...where,
          assignedToUserId: null
        }
      }),
      prismaClient.obligation.count({
        where: {
          ...where,
          assignedToUserId: {
            not: null
          }
        }
      })
    ]);

    const mismatch = Number(
      (
        await prismaClient.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM obligations o
          LEFT JOIN household_members hm
            ON hm.household_id = o.household_id
           AND hm.user_id = o.assigned_to_user_id
           AND hm.status = 'ACTIVE'
          WHERE o.scope_type = 'HOUSEHOLD'
            AND o.assigned_to_user_id IS NOT NULL
            AND o.status IN ('ACTIVE', 'POSTPONED', 'DRAFT')
            ${filters?.userId ? Prisma.sql`AND o.user_id = ${filters.userId}` : Prisma.empty}
            ${filters?.householdId
              ? Prisma.sql`AND o.household_id = ${filters.householdId}`
              : Prisma.empty}
            AND hm.id IS NULL
        `)
      )[0]?.count ?? 0
    );

    return {
      total,
      unclaimed,
      assigned,
      mismatch
    };
  }

  async getAutonomyStats(input: {
    start: Date;
    end: Date;
    filters?: ScopeFilters;
  }) {
    const whereBase: Prisma.AutonomyDecisionWhereInput = {
      createdAt: {
        gte: input.start,
        lt: input.end
      },
      userId: input.filters?.userId,
      householdId: input.filters?.householdId
    };

    const [total, executed, undone, overridden, requiringApproval] = await Promise.all([
      prismaClient.autonomyDecision.count({ where: whereBase }),
      prismaClient.autonomyDecision.count({
        where: {
          ...whereBase,
          decision: ZeroInputDecision.EXECUTED
        }
      }),
      prismaClient.autonomyDecision.count({
        where: {
          ...whereBase,
          OR: [
            {
              approvalStatus: ZeroInputApprovalStatus.UNDONE
            },
            {
              undoneAt: {
                not: null
              }
            }
          ]
        }
      }),
      prismaClient.autonomyDecision.count({
        where: {
          ...whereBase,
          OR: [
            {
              approvalStatus: ZeroInputApprovalStatus.REJECTED
            },
            {
              decision: ZeroInputDecision.REVIEW
            }
          ]
        }
      }),
      prismaClient.autonomyDecision.count({
        where: {
          ...whereBase,
          decision: ZeroInputDecision.APPROVAL_REQUIRED
        }
      })
    ]);

    return {
      total,
      executed,
      undone,
      overridden,
      requiringApproval
    };
  }

  async getBehaviorProfileStats(filters?: ScopeFilters) {
    const where: Prisma.UserBehaviorProfileWhereInput = {
      userId: filters?.userId
    };

    const [
      totalProfiles,
      unknownProfiles,
      actionSpeedGroups,
      reviewPreferenceGroups,
      deferFrequencyGroups
    ] = await Promise.all([
      prismaClient.userBehaviorProfile.count({
        where
      }),
      prismaClient.userBehaviorProfile.count({
        where: {
          ...where,
          actionSpeed: BehaviorActionSpeed.UNKNOWN,
          reviewPreference: BehaviorReviewPreference.UNKNOWN,
          deferFrequency: BehaviorDeferFrequency.UNKNOWN
        }
      }),
      prismaClient.userBehaviorProfile.groupBy({
        by: ["actionSpeed"],
        where,
        _count: {
          _all: true
        }
      }),
      prismaClient.userBehaviorProfile.groupBy({
        by: ["reviewPreference"],
        where,
        _count: {
          _all: true
        }
      }),
      prismaClient.userBehaviorProfile.groupBy({
        by: ["deferFrequency"],
        where,
        _count: {
          _all: true
        }
      })
    ]);

    return {
      totalProfiles,
      computedProfiles: Math.max(totalProfiles - unknownProfiles, 0),
      unknownProfiles,
      actionSpeed: {
        FAST:
          actionSpeedGroups.find((entry) => entry.actionSpeed === BehaviorActionSpeed.FAST)?._count
            ._all ?? 0,
        SLOW:
          actionSpeedGroups.find((entry) => entry.actionSpeed === BehaviorActionSpeed.SLOW)?._count
            ._all ?? 0,
        UNKNOWN:
          actionSpeedGroups.find((entry) => entry.actionSpeed === BehaviorActionSpeed.UNKNOWN)
            ?._count._all ?? 0
      },
      reviewPreference: {
        QUICK_ACTION:
          reviewPreferenceGroups.find(
            (entry) =>
              entry.reviewPreference === BehaviorReviewPreference.QUICK_ACTION
          )?._count._all ?? 0,
        REVIEW_FIRST:
          reviewPreferenceGroups.find(
            (entry) =>
              entry.reviewPreference === BehaviorReviewPreference.REVIEW_FIRST
          )?._count._all ?? 0,
        UNKNOWN:
          reviewPreferenceGroups.find(
            (entry) => entry.reviewPreference === BehaviorReviewPreference.UNKNOWN
          )?._count._all ?? 0
      },
      deferFrequency: {
        LOW:
          deferFrequencyGroups.find(
            (entry) => entry.deferFrequency === BehaviorDeferFrequency.LOW
          )?._count._all ?? 0,
        HIGH:
          deferFrequencyGroups.find(
            (entry) => entry.deferFrequency === BehaviorDeferFrequency.HIGH
          )?._count._all ?? 0,
        UNKNOWN:
          deferFrequencyGroups.find(
            (entry) => entry.deferFrequency === BehaviorDeferFrequency.UNKNOWN
          )?._count._all ?? 0
      }
    };
  }

  async upsertSnapshot(input: {
    metricType: string;
    value: number;
    dimension?: Prisma.InputJsonValue;
    dimensionKey: string;
    timeBucket: MetricTimeBucket;
    timestamp: Date;
  }) {
    return prismaClient.metricSnapshot.upsert({
      where: {
        metricType_timeBucket_timestamp_dimensionKey: {
          metricType: input.metricType,
          timeBucket: input.timeBucket,
          timestamp: input.timestamp,
          dimensionKey: input.dimensionKey
        }
      },
      create: {
        metricType: input.metricType,
        value: input.value,
        dimension: input.dimension,
        dimensionKey: input.dimensionKey,
        timeBucket: input.timeBucket,
        timestamp: input.timestamp
      },
      update: {
        value: input.value,
        dimension: input.dimension
      }
    });
  }

  async listSnapshots(input: {
    metricType?: string;
    timeBucket?: MetricTimeBucket;
    dimensionKey?: string;
    limit?: number;
    start?: Date;
    end?: Date;
  }) {
    return prismaClient.metricSnapshot.findMany({
      where: {
        metricType: input.metricType,
        timeBucket: input.timeBucket,
        dimensionKey: input.dimensionKey,
        timestamp:
          input.start || input.end
            ? {
                gte: input.start,
                lte: input.end
              }
            : undefined
      },
      orderBy: {
        timestamp: "desc"
      },
      take: input.limit ?? 120
    });
  }

  async getLatestSnapshotTimestamp(input: {
    timeBucket?: MetricTimeBucket;
    dimensionKey?: string;
  }) {
    const row = await prismaClient.metricSnapshot.findFirst({
      where: {
        timeBucket: input.timeBucket,
        dimensionKey: input.dimensionKey
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        createdAt: true
      }
    });

    return row?.createdAt ?? null;
  }
}
