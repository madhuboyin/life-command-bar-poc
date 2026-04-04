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
import type { DecisionTrace, TrustWhy } from "../utils/trust-layer";
import { toWhyConfidence } from "../utils/trust-layer";
import { AutoFlowService, type AutoFlowSurfaceItem } from "./auto-flow.service";

type FeedCandidate = {
  obligation: Awaited<ReturnType<ObligationRepository["findActiveForFeed"]>>[number];
  candidateScore: number;
  hookType: "urgent" | "money" | "quick_win" | "none";
  personalizationReasons: string[];
  autoFlow: AutoFlowSurfaceItem | null;
};

export class TodayFeedService {
  private readonly obligationRepository = new ObligationRepository();
  private readonly feedbackRepository = new FeedbackRepository();
  private readonly personalizationService = new PersonalizationService();
  private readonly autoFlowService = new AutoFlowService();

  async getTodayFeed(userId: string, options?: { includeTrace?: boolean }) {
    const includeTrace = options?.includeTrace ?? false;
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
    const autoFlowByObligation = await this.autoFlowService.getBoostMapByObligationIds(
      userId,
      eligible.map((item) => item.id)
    );

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
      const autoFlow = autoFlowByObligation.get(obligation.id) ?? null;
      const autoFlowBoost =
        autoFlow?.state === "READY" ? 18 : autoFlow?.state === "SUGGESTED" ? 10 : 0;

      const score =
        urgency * 0.3 +
        importance * 0.25 +
        confidence * 0.15 +
        quickWin * 0.15 +
        moneyHook * 0.15 -
        effortPenalty * 0.03 -
        postponedPenalty +
        autoFlowBoost;
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
      else if (autoFlow?.state === "READY") hookType = "urgent";

      return {
        obligation,
        candidateScore: score + adjustment.delta,
        hookType,
        personalizationReasons: adjustment.reasons,
        autoFlow
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
      const mappedObligation = mapObligation(item.obligation);
      const why = buildFeedWhy({
        obligation: mappedObligation,
        hookType: item.hookType,
        whyItMatters: flow.whyItMatters,
        personalizationReason: item.personalizationReasons[0] ?? null,
        candidateScore: item.candidateScore
      });
      const decisionTrace = buildFeedDecisionTrace({
        obligation: mappedObligation,
        hookType: item.hookType,
        candidateScore: item.candidateScore
      });

      return {
        id: `feed_${item.obligation.id}`,
        obligationId: item.obligation.id,
        obligation: {
          ...mappedObligation
        },
        why,
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
        autoFlow: item.autoFlow
          ? {
              id: item.autoFlow.id,
              triggerType: item.autoFlow.triggerType,
              state: item.autoFlow.state,
              priorityScore: item.autoFlow.priorityScore,
              ctaLabel: item.autoFlow.cta.label
            }
          : null,
        confidenceBand: mappedObligation.confidenceBand,
        sourceType: mappedObligation.sourceType,
        needsReview: mappedObligation.needsReview,
        decisionTrace: includeTrace ? decisionTrace : undefined,
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

function buildFeedWhy(input: {
  obligation: ReturnType<typeof mapObligation>;
  hookType: FeedCandidate["hookType"];
  whyItMatters: string;
  personalizationReason: string | null;
  candidateScore: number;
}): TrustWhy {
  const signals = new Set<string>();

  if (input.hookType === "urgent") signals.add("due soon");
  if (input.hookType === "money") signals.add("money exposure");
  if (input.hookType === "quick_win") signals.add("quick win");
  if (input.obligation.importanceScore >= 72) signals.add("high importance");
  if (input.obligation.status === "POSTPONED") signals.add("recent activity");

  if (signals.size === 0) {
    signals.add("high importance");
  }

  const primaryReason =
    input.hookType === "urgent"
      ? "Due soon"
      : input.hookType === "quick_win"
        ? "Low effort, high impact"
        : input.hookType === "money"
          ? "Money exposure"
          : input.whyItMatters;

  const confidence = toWhyConfidence(
    input.obligation.confidenceScore * 0.65 + normalizeCandidateScore(input.candidateScore) * 0.35
  );

  return {
    primaryReason,
    signals: Array.from(signals),
    confidence,
    personalizationReason: input.personalizationReason
  };
}

function buildFeedDecisionTrace(input: {
  obligation: ReturnType<typeof mapObligation>;
  hookType: FeedCandidate["hookType"];
  candidateScore: number;
}): DecisionTrace {
  const sourceSignals = [
    `source_type:${input.obligation.sourceType.toLowerCase()}`,
    `obligation_confidence:${Math.round(input.obligation.confidenceScore * 100)}`
  ];

  const rankingFactors = [
    `urgency:${Math.round(input.obligation.urgencyScore)}`,
    `importance:${Math.round(input.obligation.importanceScore)}`,
    `candidate_score:${Math.round(input.candidateScore)}`
  ];

  const suppressionFactors = [];
  if (input.obligation.effortLevel === "HIGH") {
    suppressionFactors.push("high_effort_penalty");
  }
  if (input.obligation.status === "POSTPONED") {
    suppressionFactors.push("postponed_penalty");
  }

  const confidenceDrivers = [
    `confidence_band:${input.obligation.confidenceBand.toLowerCase()}`,
    `hook_type:${input.hookType}`
  ];

  return {
    sourceSignals,
    rankingFactors,
    suppressionFactors,
    confidenceDrivers
  };
}

function normalizeCandidateScore(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  const normalized = value / 100;
  if (normalized < 0) return 0;
  if (normalized > 1) return 1;
  return normalized;
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
