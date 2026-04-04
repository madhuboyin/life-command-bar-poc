import { PredictionStatus, ScopeType, ZeroInputApprovalStatus, ZeroInputDecision } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { mapObligation } from "../utils/obligation.mapper";
import { requireHouseholdMember } from "../utils/household-access";

type HouseholdPulseItem = {
  obligationId: string;
  title: string;
  dueDate: string | null;
  status: string;
  priorityScore: number;
  scopeType: "HOUSEHOLD";
  assignment: {
    state: "MINE" | "ASSIGNED" | "UNASSIGNED";
    assignedToUserId: string | null;
    assignedToName: string | null;
  };
  whyShown: string;
  sourceType: string;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  needsReview: boolean;
};

type HouseholdControlTowerResponse = {
  generatedAt: string;
  householdId: string;
  review: HouseholdPulseItem[];
  ready: HouseholdPulseItem[];
  approvals: Array<{
    id: string;
    title: string;
    candidateAction: string;
    confidenceScore: number;
    status: string;
    createdAt: string;
  }>;
  upcoming: Array<{
    id: string;
    title: string;
    predictedDate: string | null;
    confidenceBand: "HIGH" | "MEDIUM" | "LOW";
    rationaleSummary: string | null;
  }>;
  recent: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    obligationId: string | null;
    actorUserId: string;
  }>;
  summary: {
    reviewCount: number;
    readyCount: number;
    approvalCount: number;
    upcomingCount: number;
    recentCount: number;
  };
};

export class HouseholdSurfaceService {
  async getPulse(userId: string, householdId: string) {
    await requireHouseholdMember(householdId, userId);

    const obligations = await prisma.obligation.findMany({
      where: {
        householdId,
        scopeType: ScopeType.HOUSEHOLD,
        status: {
          in: ["ACTIVE", "POSTPONED", "DRAFT"]
        }
      },
      include: {
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
            name: true,
            email: true
          }
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        lastHandledByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: [{ dueDate: "asc" }, { urgencyScore: "desc" }, { createdAt: "desc" }],
      take: 80
    });

    const items = obligations
      .map((item) => mapObligation(item))
      .map<HouseholdPulseItem>((item) => {
        const dueDate = item.dueDate ? new Date(item.dueDate) : null;
        const dueSoon = dueDate ? dueDate.getTime() <= Date.now() + 3 * 24 * 60 * 60 * 1000 : false;
        const priorityScore =
          item.urgencyScore * 0.55 +
          item.importanceScore * 0.35 +
          (dueSoon ? 18 : 0) +
          (item.needsReview ? 12 : 0) +
          (item.assignedToUserId ? 0 : 8);
        const assignmentState: HouseholdPulseItem["assignment"]["state"] =
          item.assignedToUserId === userId
            ? "MINE"
            : item.assignedToUserId
              ? "ASSIGNED"
              : "UNASSIGNED";

        const whyShown =
          assignmentState === "MINE"
            ? "Assigned to you"
            : assignmentState === "ASSIGNED"
              ? `Assigned to ${item.assignee?.name ?? item.assignee?.email ?? "member"}`
              : dueSoon
                ? "Unassigned and due soon"
                : "Unassigned shared household item";

        return {
          obligationId: item.id,
          title: item.title,
          dueDate: item.dueDate,
          status: item.status,
          priorityScore,
          scopeType: "HOUSEHOLD",
          assignment: {
            state: assignmentState,
            assignedToUserId: item.assignedToUserId,
            assignedToName: item.assignee?.name ?? item.assignee?.email ?? null
          },
          whyShown,
          sourceType: item.sourceType,
          confidenceBand: item.confidenceBand,
          needsReview: item.needsReview
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const assignedToMe = items.filter((item) => item.assignment.state === "MINE");
    const unassigned = items.filter((item) => item.assignment.state === "UNASSIGNED");

    return {
      generatedAt: new Date().toISOString(),
      householdId,
      items: items.slice(0, 25),
      summary: {
        totalOpen: items.length,
        assignedToMeCount: assignedToMe.length,
        unassignedCount: unassigned.length,
        urgentCount: items.filter((item) => item.priorityScore >= 75).length
      }
    };
  }

  async getControlTower(userId: string, householdId: string): Promise<HouseholdControlTowerResponse> {
    await requireHouseholdMember(householdId, userId);
    const pulse = await this.getPulse(userId, householdId);

    const [approvals, upcomingPredictions, recent] = await Promise.all([
      prisma.autonomyDecision.findMany({
        where: {
          householdId,
          scopeType: ScopeType.HOUSEHOLD,
          decision: ZeroInputDecision.APPROVAL_REQUIRED,
          approvalStatus: ZeroInputApprovalStatus.PENDING
        },
        orderBy: [{ createdAt: "desc" }],
        take: 10
      }),
      prisma.prediction.findMany({
        where: {
          householdId,
          scopeType: ScopeType.HOUSEHOLD,
          status: PredictionStatus.ACTIVE
        },
        orderBy: [{ predictedDate: "asc" }, { confidenceScore: "desc" }, { createdAt: "desc" }],
        take: 12
      }),
      prisma.auditEvent.findMany({
        where: {
          householdId
        },
        orderBy: [{ createdAt: "desc" }],
        take: 12
      })
    ]);

    const review = pulse.items
      .filter((item) => item.needsReview || item.status === "DRAFT")
      .slice(0, 8);

    const ready = pulse.items
      .filter(
        (item) =>
          (item.assignment.state === "MINE" || item.assignment.state === "UNASSIGNED") &&
          !item.needsReview
      )
      .slice(0, 8);

    return {
      generatedAt: new Date().toISOString(),
      householdId,
      review,
      ready,
      approvals: approvals.map((item) => ({
        id: item.id,
        title: item.title,
        candidateAction: item.candidateAction,
        confidenceScore: Number(item.confidenceScore),
        status: item.approvalStatus,
        createdAt: item.createdAt.toISOString()
      })),
      upcoming: upcomingPredictions.map((item) => ({
        id: item.id,
        title: item.title,
        predictedDate: item.predictedDate?.toISOString() ?? null,
        confidenceBand: item.confidenceBand,
        rationaleSummary: item.rationaleSummary
      })),
      recent: recent.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        createdAt: item.createdAt.toISOString(),
        obligationId: item.obligationId,
        actorUserId: item.userId
      })),
      summary: {
        reviewCount: review.length,
        readyCount: ready.length,
        approvalCount: approvals.length,
        upcomingCount: upcomingPredictions.length,
        recentCount: recent.length
      }
    };
  }

  async getReady(userId: string, householdId: string) {
    const data = await this.getControlTower(userId, householdId);
    return {
      items: data.ready
    };
  }

  async getUpcoming(userId: string, householdId: string) {
    const data = await this.getControlTower(userId, householdId);
    return {
      items: data.upcoming
    };
  }

  async getRecent(userId: string, householdId: string) {
    const data = await this.getControlTower(userId, householdId);
    return {
      items: data.recent
    };
  }
}
