import { ObligationStatus, ObligationType, Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import {
  CreateObligationInput,
  ObligationListQuery,
  ObligationSort,
  ObligationView,
  SortDirection,
  UpdateObligationInput
} from "../types/obligation.types";

export class ObligationRepository {
  async findMany(query: ObligationListQuery & { userId: string }) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const where = buildListWhere(query);
    const orderBy = buildOrderBy({
      view: query.view,
      sort: query.sort,
      direction: query.direction
    });

    const [items, total] = await Promise.all([
      prisma.obligation.findMany({
        where,
        include: obligationTrustInclude,
        orderBy,
        skip: offset,
        take: limit
      }),
      prisma.obligation.count({ where })
    ]);

    return {
      items,
      total,
      limit,
      offset,
      appliedView: query.view ?? null
    };
  }

  async findActiveForFeed(userId: string) {
    return prisma.obligation.findMany({
      where: {
        userId,
        status: {
          in: [ObligationStatus.ACTIVE, ObligationStatus.POSTPONED]
        }
      },
      include: obligationTrustInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  async findById(id: string, userId: string) {
    return prisma.obligation.findFirst({
      where: {
        id,
        userId
      },
      include: obligationTrustInclude
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
      },
      include: obligationTrustInclude
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
      },
      include: obligationTrustInclude
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
    const [auditEvents, feedbackEvents, resolutionRuns, reminders, guidedJourneyEvents, guidedJourneys, outcomeFeedbackEvents, autonomyDecisions] = await Promise.all([
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
      }),
      prisma.guidedJourneyEvent.findMany({
        where: { obligationId: id, userId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.guidedJourney.findMany({
        where: { obligationId: id, userId },
        include: {
          steps: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              stepKey: true,
              isCompleted: true,
              position: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }),
      prisma.outcomeFeedback.findMany({
        where: { obligationId: id, userId },
        orderBy: { createdAt: "desc" }
      }),
      prisma.autonomyDecision.findMany({
        where: { obligationId: id, userId },
        orderBy: { createdAt: "desc" }
      })
    ]);

    return {
      auditEvents,
      feedbackEvents,
      resolutionRuns,
      reminders,
      guidedJourneyEvents,
      guidedJourneys,
      outcomeFeedbackEvents,
      autonomyDecisions
    };
  }

  async findReviewQueueCandidates(userId: string, limit = 100) {
    return prisma.obligation.findMany({
      where: {
        userId,
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
      },
      include: obligationTrustInclude,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: limit
    });
  }
}

function toAuditMetadata(input: UpdateObligationInput): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Prisma.InputJsonObject;
}

const obligationTrustInclude = {
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

const OPEN_STATUSES: ObligationStatus[] = [
  ObligationStatus.ACTIVE,
  ObligationStatus.POSTPONED
];

const QUICK_WIN_CONFIDENCE_THRESHOLD = 0.85;
const QUICK_WIN_IMPORTANCE_THRESHOLD = 50;
const URGENCY_THRESHOLD = 85;
const URGENT_DUE_WINDOW_HOURS = 48;
const RECENT_ACTIVITY_DAYS = 7;

function buildListWhere(
  query: ObligationListQuery & { userId: string }
): Prisma.ObligationWhereInput {
  const conditions: Prisma.ObligationWhereInput[] = [{ userId: query.userId }];

  if (query.status) {
    conditions.push({
      status: query.status as ObligationStatus
    });
  }

  if (query.type) {
    conditions.push({
      type: query.type as ObligationType
    });
  }

  const viewCondition = buildViewCondition(query.view);
  if (viewCondition) {
    conditions.push(viewCondition);
  }

  return conditions.length === 1 ? conditions[0] : { AND: conditions };
}

function buildViewCondition(view?: ObligationView): Prisma.ObligationWhereInput | null {
  if (!view) return null;

  const now = new Date();
  const recentWindowStart = getWindowStart(now, RECENT_ACTIVITY_DAYS);
  const urgentDueThreshold = addHours(now, URGENT_DUE_WINDOW_HOURS);

  switch (view) {
    case "urgent":
      return {
        status: {
          in: OPEN_STATUSES
        },
        OR: [
          {
            dueDate: {
              lte: urgentDueThreshold
            }
          },
          {
            urgencyScore: {
              gte: URGENCY_THRESHOLD
            }
          }
        ]
      };
    case "quick_wins":
      return {
        status: {
          in: OPEN_STATUSES
        },
        effortLevel: "LOW",
        confidenceScore: {
          gte: QUICK_WIN_CONFIDENCE_THRESHOLD
        },
        importanceScore: {
          gte: QUICK_WIN_IMPORTANCE_THRESHOLD
        },
        impactLevel: {
          in: ["MEDIUM", "HIGH"]
        }
      };
    case "money":
      return {
        status: {
          in: OPEN_STATUSES
        },
        amount: {
          gt: 0
        }
      };
    case "renewals":
      return {
        status: {
          in: OPEN_STATUSES
        },
        type: "RENEWAL"
      };
    case "subscriptions":
      return {
        status: {
          in: OPEN_STATUSES
        },
        type: "SUBSCRIPTION"
      };
    case "bills":
      return {
        status: {
          in: OPEN_STATUSES
        },
        type: "BILL"
      };
    case "postponed_recently":
      return {
        OR: [
          {
            status: "POSTPONED"
          },
          {
            feedbackEvents: {
              some: {
                type: "POSTPONED",
                createdAt: {
                  gte: recentWindowStart
                }
              }
            }
          },
          {
            auditEvents: {
              some: {
                eventType: "obligation_postponed",
                createdAt: {
                  gte: recentWindowStart
                }
              }
            }
          }
        ]
      };
    case "resolved_recently":
      return {
        status: "RESOLVED",
        OR: [
          {
            lastActedAt: {
              gte: recentWindowStart
            }
          },
          {
            feedbackEvents: {
              some: {
                type: "COMPLETED",
                createdAt: {
                  gte: recentWindowStart
                }
              }
            }
          },
          {
            auditEvents: {
              some: {
                eventType: "obligation_marked_done",
                createdAt: {
                  gte: recentWindowStart
                }
              }
            }
          }
        ]
      };
    case "active_now":
      return {
        status: {
          in: OPEN_STATUSES
        }
      };
    case "commitments":
      return {
        status: {
          in: OPEN_STATUSES
        },
        type: "COMMITMENT"
      };
    default:
      return null;
  }
}

function buildOrderBy(input: {
  view?: ObligationView;
  sort?: ObligationSort;
  direction?: SortDirection;
}): Prisma.ObligationOrderByWithRelationInput[] {
  if (input.sort) {
    const direction = input.direction ?? defaultDirectionForSort(input.sort);
    return [
      sortToOrderBy(input.sort, direction),
      {
        createdAt: "desc"
      }
    ];
  }

  return defaultOrderByForView(input.view);
}

function defaultOrderByForView(
  view?: ObligationView
): Prisma.ObligationOrderByWithRelationInput[] {
  switch (view) {
    case "urgent":
      return [{ dueDate: "asc" }, { urgencyScore: "desc" }, { createdAt: "desc" }];
    case "quick_wins":
      return [
        { impactLevel: "desc" },
        { importanceScore: "desc" },
        { confidenceScore: "desc" },
        { dueDate: "asc" }
      ];
    case "money":
      return [{ dueDate: "asc" }, { amount: "desc" }, { createdAt: "desc" }];
    case "resolved_recently":
      return [{ lastActedAt: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }];
    case "postponed_recently":
      return [{ lastActedAt: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }];
    case "renewals":
    case "subscriptions":
    case "bills":
    case "commitments":
    case "active_now":
    default:
      return [{ dueDate: "asc" }, { createdAt: "desc" }];
  }
}

function sortToOrderBy(sort: ObligationSort, direction: SortDirection) {
  switch (sort) {
    case "due_date":
      return { dueDate: direction } satisfies Prisma.ObligationOrderByWithRelationInput;
    case "importance":
      return { importanceScore: direction } satisfies Prisma.ObligationOrderByWithRelationInput;
    case "urgency":
      return { urgencyScore: direction } satisfies Prisma.ObligationOrderByWithRelationInput;
    case "amount":
      return { amount: direction } satisfies Prisma.ObligationOrderByWithRelationInput;
    case "created_at":
    default:
      return { createdAt: direction } satisfies Prisma.ObligationOrderByWithRelationInput;
  }
}

function defaultDirectionForSort(sort: ObligationSort): SortDirection {
  if (sort === "due_date") return "asc";
  return "desc";
}

function getWindowStart(now: Date, trailingDays: number) {
  const start = new Date(now);
  start.setDate(start.getDate() - trailingDays);
  return start;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
