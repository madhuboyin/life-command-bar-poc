import { ObligationStatus, ObligationType } from "@prisma/client";
import {
  buildBillFlow,
  buildRenewalFlow,
  buildSubscriptionFlow
} from "@lcb/flows";
import { ObligationRepository } from "../repositories/obligation.repository";
import { FeedbackRepository } from "../repositories/feedback.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { PersonalizationService } from "./personalization.service";
import type { PersonalizationSignals } from "../types/personalization.types";

type FeedCandidate = {
  obligation: Awaited<ReturnType<ObligationRepository["findActiveForFeed"]>>[number];
  candidateScore: number;
  hookType: "urgent" | "money" | "quick_win" | "none";
  personalizationReasons: string[];
};

export class TodayFeedService {
  private readonly obligationRepository = new ObligationRepository();
  private readonly feedbackRepository = new FeedbackRepository();
  private readonly personalizationService = new PersonalizationService();

  async getTodayFeed(userId: string) {
    const [items, feedbackMap, personalizationSummary] = await Promise.all([
      this.obligationRepository.findActiveForFeed(userId),
      this.feedbackRepository.getRecentFeedbackMap(userId),
      this.personalizationService.getSummary(userId).catch(() => null)
    ]);
    const signals = personalizationSummary?.signals ?? getDefaultSignals();

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

      const postponedPenalty =
        obligation.status === ObligationStatus.POSTPONED ? 5 : 0;

      const score =
        urgency * 0.3 +
        importance * 0.25 +
        confidence * 0.15 +
        quickWin * 0.15 +
        moneyHook * 0.15 -
        effortPenalty * 0.03 -
        postponedPenalty;
      const adjustment = this.personalizationService.getTodayFeedScoreAdjustment(signals, {
        obligationType: obligation.type,
        isUrgent: urgency >= 85 || Boolean(obligation.dueDate && obligation.dueDate <= new Date(Date.now() + 48 * 60 * 60 * 1000)),
        isQuickWin: quickWin > 0,
        isMoney: moneyHook > 0,
        importanceScore: importance,
        urgencyScore: urgency
      });

      let hookType: FeedCandidate["hookType"] = "none";
      if (urgency >= 85) hookType = "urgent";
      else if (moneyHook > 0) hookType = "money";
      else if (quickWin > 0) hookType = "quick_win";

      return {
        obligation,
        candidateScore: score + adjustment.delta,
        hookType,
        personalizationReasons: adjustment.reasons
      };
    });

    candidates.sort((a, b) => b.candidateScore - a.candidateScore);

    let selected = candidates.slice(0, 5);

    const hasHook = selected.some((item) => item.hookType !== "none");
    if (!hasHook) {
      const hookCandidate = candidates.find((item) => item.hookType !== "none");
      if (
        hookCandidate &&
        !selected.find((s) => s.obligation.id === hookCandidate.obligation.id)
      ) {
        selected = [hookCandidate, ...selected.slice(0, 4)];
      }
    }

    selected = selected.slice(0, 5);

    await this.obligationRepository.updateLastShownAt(
      selected.map((item) => item.obligation.id)
    );

    const feedItems = selected.map((item, index) => {
      const flow = this.buildFlow(item.obligation, signals);

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

  private buildFlow(obligation: FeedCandidate["obligation"], signals: PersonalizationSignals) {
    const mapped = mapObligation(obligation);
    const flow =
      obligation.type === ObligationType.SUBSCRIPTION
        ? buildSubscriptionFlow(mapped as never)
        : obligation.type === ObligationType.RENEWAL
          ? buildRenewalFlow(mapped as never)
          : obligation.type === ObligationType.BILL
            ? buildBillFlow(mapped as never)
            : {
                flowKey: "commitment.default",
                recommendation: `Handle ${mapped.title} now if it only takes a few minutes, or postpone it intentionally.`,
                whyItMatters: "This is still unresolved and continuing to take up mental space.",
                steps: [
                  "Review what is actually required.",
                  "Do it now if it is quick.",
                  "Otherwise postpone it intentionally to a specific time."
                ],
                primaryAction: "Do this now",
                secondaryActions: ["Postpone 1 day", "Dismiss"]
              };

    const toneHint = this.personalizationService.getGuidanceToneHint(
      signals,
      obligation.type
    );
    if (!toneHint) {
      return flow;
    }

    return {
      ...flow,
      whyItMatters: `${flow.whyItMatters} ${toneHint}`
    };
  }
}

function getDefaultSignals(): PersonalizationSignals {
  return {
    subscriptionPreferenceBias: "balanced",
    postponementPattern: "none",
    quickWinAffinity: "medium",
    urgencyResponsiveness: "medium",
    moneySensitivity: "review_first",
    journeyCompletionStyle: "mixed",
    reminderReliance: "low"
  };
}
