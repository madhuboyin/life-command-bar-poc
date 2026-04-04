import { prisma } from "../clients/prisma.client";

export class PersonalizationRepository {
  async getSignalWindowData(userId: string, windowStart: Date) {
    const [
      outcomeFeedback,
      auditEvents,
      feedbackEvents,
      guidedJourneys,
      guidedJourneyEvents,
      resolutionRuns,
      reminders
    ] = await Promise.all([
      prisma.outcomeFeedback.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          obligationId: true,
          guidedJourneyId: true,
          sourceContext: true,
          recommendationKey: true,
          selectedActionKey: true,
          outcomeType: true,
          createdAt: true,
          obligation: {
            select: {
              id: true,
              type: true,
              amount: true,
              dueDate: true,
              urgencyScore: true,
              importanceScore: true,
              effortLevel: true,
              impactLevel: true
            }
          }
        }
      }),
      prisma.auditEvent.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          },
          eventType: {
            in: [
              "obligation_marked_done",
              "obligation_postponed",
              "obligation_dismissed"
            ]
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          obligationId: true,
          eventType: true,
          createdAt: true,
          metadata: true,
          obligation: {
            select: {
              id: true,
              type: true,
              amount: true,
              dueDate: true,
              urgencyScore: true,
              importanceScore: true,
              effortLevel: true,
              impactLevel: true
            }
          }
        }
      }),
      prisma.feedbackEvent.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          obligationId: true,
          type: true,
          note: true,
          createdAt: true,
          obligation: {
            select: {
              id: true,
              type: true,
              amount: true,
              dueDate: true,
              urgencyScore: true,
              importanceScore: true,
              effortLevel: true,
              impactLevel: true
            }
          }
        }
      }),
      prisma.guidedJourney.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          obligationId: true,
          journeyType: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true
        }
      }),
      prisma.guidedJourneyEvent.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          journeyId: true,
          obligationId: true,
          eventType: true,
          metadata: true,
          createdAt: true
        }
      }),
      prisma.resolutionRun.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          obligationId: true,
          flowKey: true,
          recommendedOption: true,
          createdAt: true
        }
      }),
      prisma.reminder.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          obligationId: true,
          status: true,
          scheduledFor: true,
          createdAt: true
        }
      })
    ]);

    return {
      outcomeFeedback,
      auditEvents,
      feedbackEvents,
      guidedJourneys,
      guidedJourneyEvents,
      resolutionRuns,
      reminders
    };
  }
}
