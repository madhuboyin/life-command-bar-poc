import { ObligationStatus } from "@prisma/client";
import { mapObligation } from "../utils/obligation.mapper";

export type FocusDurationMinutes = 5 | 10 | 15;

export type FocusSelectionInput = {
  durationMinutes: FocusDurationMinutes;
  obligations: Array<ReturnType<typeof mapObligation>>;
  getPersonalizationDelta: (input: {
    obligationId: string;
    obligationType: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
    isUrgent: boolean;
    isQuickWin: boolean;
    isMoney: boolean;
    importanceScore: number;
    urgencyScore: number;
  }) => { delta: number; reasons: string[] };
  estimateMinutes: (input: {
    effortLevel: "LOW" | "MEDIUM" | "HIGH";
    needsReview: boolean;
    confidenceScore: number;
  }) => number;
};

export type FocusSelectionItem = {
  obligationId: string;
  title: string;
  whyIncluded: string;
  estimatedMinutes: number;
  priorityScore: number;
  sourceType: "EMAIL" | "UPLOAD" | "COMMAND" | "MANUAL";
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  needsReview: boolean;
  obligation: ReturnType<typeof mapObligation>;
};

type Candidate = {
  obligation: ReturnType<typeof mapObligation>;
  estimatedMinutes: number;
  priorityScore: number;
  personalizationReasons: string[];
  isUrgent: boolean;
  isQuickWin: boolean;
  isMoney: boolean;
  isHeavy: boolean;
};

export function selectFocusItems(input: FocusSelectionInput): FocusSelectionItem[] {
  const budget = getDurationBudget(input.durationMinutes);
  const candidates = input.obligations
    .filter((item) => item.status === ObligationStatus.ACTIVE || item.status === ObligationStatus.POSTPONED)
    .map((obligation) => toCandidate(obligation, input))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const selected: Candidate[] = [];
  let totalMinutes = 0;
  let heavyCount = 0;

  for (const candidate of candidates) {
    if (selected.length >= budget.maxItems) break;
    if (candidate.isHeavy && heavyCount >= budget.heavyLimit) continue;
    if (input.durationMinutes === 5 && candidate.estimatedMinutes > 7) continue;

    const nextMinutes = totalMinutes + candidate.estimatedMinutes;
    if (selected.length > 0 && nextMinutes > budget.softMinutesCap) continue;

    selected.push(candidate);
    totalMinutes = nextMinutes;
    if (candidate.isHeavy) heavyCount += 1;
  }

  if (selected.length < budget.minItems) {
    for (const candidate of candidates) {
      if (selected.length >= budget.maxItems) break;
      if (selected.find((item) => item.obligation.id === candidate.obligation.id)) continue;
      if (input.durationMinutes === 5 && candidate.estimatedMinutes > 7) continue;
      selected.push(candidate);
      if (candidate.isHeavy) heavyCount += 1;
      if (selected.length >= budget.minItems) break;
    }
  }

  if (selected.length === 0 && candidates.length > 0) {
    selected.push(candidates[0]);
  }

  const ordered = [...selected].sort((a, b) => compareExecutionOrder(a, b, input.durationMinutes));

  return ordered.map((item) => ({
    obligationId: item.obligation.id,
    title: item.obligation.title,
    whyIncluded: buildWhyIncluded(item),
    estimatedMinutes: item.estimatedMinutes,
    priorityScore: Math.round(item.priorityScore * 100) / 100,
    sourceType: item.obligation.sourceType,
    confidenceBand: item.obligation.confidenceBand,
    needsReview: item.obligation.needsReview,
    obligation: item.obligation
  }));
}

function toCandidate(
  obligation: ReturnType<typeof mapObligation>,
  input: FocusSelectionInput
): Candidate {
  const estimatedMinutes = input.estimateMinutes({
    effortLevel: obligation.effortLevel,
    needsReview: obligation.needsReview,
    confidenceScore: obligation.confidenceScore
  });
  const isUrgent =
    obligation.urgencyScore >= 82 ||
    Boolean(obligation.dueDate && new Date(obligation.dueDate).getTime() <= Date.now() + 48 * 60 * 60 * 1000);
  const isQuickWin = obligation.effortLevel === "LOW" && obligation.impactLevel !== "LOW";
  const isMoney = typeof obligation.amount === "number" && obligation.amount > 0;
  const isHeavy = estimatedMinutes >= 8;

  const impactBonus =
    obligation.impactLevel === "HIGH" ? 12 : obligation.impactLevel === "MEDIUM" ? 6 : 2;
  const confidenceWeight = obligation.confidenceScore * 100 * 0.16;
  const urgencyWeight = obligation.urgencyScore * 0.36;
  const importanceWeight = obligation.importanceScore * 0.28 + impactBonus;
  const quickWinBonus = isQuickWin ? 8 : 0;
  const postponedPenalty = obligation.status === ObligationStatus.POSTPONED ? -3 : 0;
  const reviewPenalty = obligation.needsReview ? -6 : 0;

  const personalization = input.getPersonalizationDelta({
    obligationId: obligation.id,
    obligationType: obligation.type,
    isUrgent,
    isQuickWin,
    isMoney,
    importanceScore: obligation.importanceScore,
    urgencyScore: obligation.urgencyScore
  });

  const priorityScore =
    urgencyWeight +
    importanceWeight +
    confidenceWeight +
    quickWinBonus +
    personalization.delta +
    postponedPenalty +
    reviewPenalty;

  return {
    obligation,
    estimatedMinutes,
    priorityScore,
    personalizationReasons: personalization.reasons,
    isUrgent,
    isQuickWin,
    isMoney,
    isHeavy
  };
}

function compareExecutionOrder(
  a: Candidate,
  b: Candidate,
  durationMinutes: FocusDurationMinutes
) {
  if (durationMinutes === 5) {
    if (a.isQuickWin !== b.isQuickWin) return a.isQuickWin ? -1 : 1;
    if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
    return b.priorityScore - a.priorityScore;
  }

  if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
  if (a.isQuickWin !== b.isQuickWin) return a.isQuickWin ? -1 : 1;
  return b.priorityScore - a.priorityScore;
}

function buildWhyIncluded(candidate: Candidate) {
  if (candidate.isQuickWin && candidate.obligation.impactLevel !== "LOW") {
    return "Low effort and worth clearing now.";
  }

  if (candidate.isUrgent) {
    return "Due soon, but manageable in this session.";
  }

  if (candidate.personalizationReasons.some((reason) => reason.includes("predicted"))) {
    return "Likely upcoming soon, so preparing now keeps things calm.";
  }

  if (candidate.obligation.status === ObligationStatus.POSTPONED) {
    return "Recently postponed and good to close now.";
  }

  if (candidate.isMoney) {
    return "Money-related item with clear value to handle.";
  }

  if (candidate.personalizationReasons.length > 0) {
    return "Good fit based on your recent action pattern.";
  }

  return "High-value item that fits this time box.";
}

function getDurationBudget(durationMinutes: FocusDurationMinutes) {
  if (durationMinutes === 5) {
    return {
      minItems: 1,
      maxItems: 3,
      softMinutesCap: 6,
      heavyLimit: 0
    };
  }

  if (durationMinutes === 10) {
    return {
      minItems: 2,
      maxItems: 4,
      softMinutesCap: 12,
      heavyLimit: 1
    };
  }

  return {
    minItems: 3,
    maxItems: 5,
    softMinutesCap: 18,
    heavyLimit: 1
  };
}
