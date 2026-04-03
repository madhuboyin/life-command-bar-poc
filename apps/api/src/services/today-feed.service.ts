import { ObligationStatus, ObligationType } from "@prisma/client";
import {
  buildBillFlow,
  buildRenewalFlow,
  buildSubscriptionFlow
} from "@lcb/flows";
import { ObligationRepository } from "../repositories/obligation.repository";
import { FeedbackRepository } from "../repositories/feedback.repository";
import { mapObligation } from "../utils/obligation.mapper";

type FeedCandidate = {
  obligation: Awaited<ReturnType<ObligationRepository["findMany"]>>["items"][number];
  candidateScore: number;
  hookType: "urgent" | "money" | "quick_win" | "none";
};

export class TodayFeedService {
  private readonly obligationRepository = new ObligationRepository();
  private readonly feedbackRepository = new FeedbackRepository();

  async getTodayFeed(userId: string) {
    const { items } = await this.obligationRepository.findMany({
      userId,
      status: ObligationStatus.ACTIVE,
      limit: 100,
      offset: 0
    });

    const feedbackMap = await this.feedbackRepository.getRecentFeedbackMap(userId);

    const eligible = items.filter((item) => {
      const feedback = feedbackMap.get(item.id) ?? [];
      if (feedback.includes("DONT_SHOW_AGAIN")) return false;
      if (feedback.includes("NOT_RELEVANT")) return false;
      if (item.status === ObligationStatus.RESOLVED) return false;
      if (item.status === ObligationStatus.IGNORED) return false;
      return true;
    });

    const candidates = eligible.map((obligation) => {
      const urgency = Number(obligation.urgencyScore);
      const importance = Number(obligation.importanceScore);
      const confidence = Number(obligation.confidenceScore) * 100;

      const effortPenalty =
        obligation.effortLevel === "HIGH"
          ? 15
          : obligation.effortLevel === "MEDIUM"
            ? 7
            : 0;

      const quickWin =
        obligation.effortLevel === "LOW" &&
        Number(obligation.confidenceScore) >= 0.85 &&
        importance >= 50
          ? 20
          : 0;

      const moneyHook =
        obligation.amount && Number(obligation.amount) > 0 ? 12 : 0;

      const score =
        urgency * 0.3 +
        importance * 0.25 +
        confidence * 0.15 +
        quickWin * 0.15 +
        moneyHook * 0.15 -
        effortPenalty * 0.03;

      let hookType: FeedCandidate["hookType"] = "none";
      if (urgency >= 85) hookType = "urgent";
      else if (moneyHook > 0) hookType = "money";
      else if (quickWin > 0) hookType = "quick_win";

      return {
        obligation,
        candidateScore: score,
        hookType
      };
    });

    candidates.sort((a, b) => b.candidateScore - a.candidateScore);

    let selected = candidates.slice(0, 5);

    const hasHook = selected.some((item) => item.hookType !== "none");
    if (!hasHook) {
      const hookCandidate = candidates.find((item) => item.hookType !== "none");
      if (hookCandidate && !selected.find((s) => s.obligation.id === hookCandidate.obligation.id)) {
        selected = [hookCandidate, ...selected.slice(0, 4)];
      }
    }

    selected = selected.slice(0, 5);

    await this.obligationRepository.updateLastShownAt(
      selected.map((item) => item.obligation.id)
    );

    const feedItems = selected.map((item, index) => {
      const flow = this.buildFlow(item.obligation);

      return {
        id: `feed_${item.obligation.id}`,
        obligationId: item.obligation.id,
        obligation: {
          ...mapObligation(item.obligation)
        },
        whyItMatters: flow.whyItMatters,
        whatToDo: flow.recommendation,
        howHardIsIt: item.obligation.effortLevel.toLowerCase(),
        primaryAction: {
          key: flow.primaryAction,
          label: flow.primaryAction
        },
        secondaryActions: flow.secondaryActions.map((action) => ({
          key: action,
          label: action
        })),
        rank: index + 1,
        hookType: item.hookType,
        generatedAt: new Date().toISOString()
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      items: feedItems
    };
  }

  private buildFlow(obligation: FeedCandidate["obligation"]) {
    const mapped = mapObligation(obligation);

    switch (obligation.type) {
      case ObligationType.SUBSCRIPTION:
        return buildSubscriptionFlow(mapped as never);
      case ObligationType.RENEWAL:
        return buildRenewalFlow(mapped as never);
      case ObligationType.BILL:
      case ObligationType.COMMITMENT:
      default:
        return buildBillFlow(mapped as never);
    }
  }
}
