import type {
  ObligationIntelligenceCategory,
  ObligationIntelligenceConfidenceBand,
  ObligationIntelligencePriority,
  ObligationIntelligenceSurfacingTarget
} from "./obligation-intelligence.types";

type PrioritizerInput = {
  category: ObligationIntelligenceCategory;
  confidenceBand: ObligationIntelligenceConfidenceBand;
  confidenceScore: number;
  amount: number | null;
  dueDate: string | null;
  paymentDueDate: string | null;
  renewalDate: string | null;
  statementDate: string | null;
  recurrenceHint: string | null;
  needsReview: boolean;
  alreadyAcknowledged: boolean;
  now: Date;
};

const CATEGORY_WEIGHT: Record<ObligationIntelligenceCategory, number> = {
  SUBSCRIPTION: 58,
  BILL: 68,
  STATEMENT: 52,
  PAYMENT_DUE: 76,
  UTILITY: 74,
  TELECOM: 69,
  INSURANCE: 72,
  CREDIT_CARD: 76,
  LOAN: 77,
  SERVICE_RENEWAL: 66,
  COMPLIANCE: 61,
  COMMITMENT: 52,
  UNKNOWN: 40
};

export function prioritizeObligation(input: PrioritizerInput): ObligationIntelligencePriority {
  const actionableDate =
    input.paymentDueDate ?? input.renewalDate ?? input.dueDate ?? input.statementDate ?? null;
  const daysToAction = daysUntil(actionableDate, input.now);
  const dueDateWeight = dueDateScore(daysToAction);
  const amountWeight = amountScore(input.amount);
  const confidenceWeight =
    input.confidenceBand === "HIGH" ? 10 : input.confidenceBand === "MEDIUM" ? 4 : -8;
  const recurrenceWeight = input.recurrenceHint ? 5 : 0;
  const reviewPenalty = input.needsReview ? -7 : 0;
  const acknowledgedPenalty = input.alreadyAcknowledged ? -10 : 0;

  let priorityScore =
    CATEGORY_WEIGHT[input.category] * 0.45 +
    dueDateWeight * 0.35 +
    amountWeight * 0.14 +
    confidenceWeight +
    recurrenceWeight +
    reviewPenalty +
    acknowledgedPenalty;

  if (input.category === "STATEMENT" && !input.paymentDueDate && !input.dueDate) {
    priorityScore -= 8;
  }

  if (input.confidenceBand === "LOW" && input.category !== "PAYMENT_DUE") {
    priorityScore -= 6;
  }

  const score = clamp(Math.round(priorityScore), 10, 99);
  const priorityBand = toPriorityBand(score);
  const recommendedSurfacingTarget = toSurfacingTarget({
    category: input.category,
    confidenceBand: input.confidenceBand,
    priorityBand,
    daysToAction
  });

  const rationale = buildRationale({
    category: input.category,
    amount: input.amount,
    confidenceBand: input.confidenceBand,
    daysToAction,
    recommendedSurfacingTarget
  });

  return {
    priorityScore: score,
    priorityBand,
    recommendedSurfacingTarget,
    rationale
  };
}

function toPriorityBand(score: number) {
  if (score >= 82) return "URGENT";
  if (score >= 66) return "HIGH";
  if (score >= 44) return "MEDIUM";
  return "LOW";
}

function toSurfacingTarget(input: {
  category: ObligationIntelligenceCategory;
  confidenceBand: ObligationIntelligenceConfidenceBand;
  priorityBand: ObligationIntelligencePriority["priorityBand"];
  daysToAction: number | null;
}): ObligationIntelligenceSurfacingTarget {
  if (input.confidenceBand === "LOW") return "CONTROL_TOWER_REVIEW";
  if (input.priorityBand === "URGENT") return "PULSE";
  if (input.priorityBand === "HIGH") return "CONTROL_TOWER_READY";
  if (input.category === "STATEMENT" && (input.daysToAction === null || input.daysToAction > 7)) {
    return "UPCOMING";
  }
  if (input.priorityBand === "MEDIUM") return "UPCOMING";
  return "SUPPRESS";
}

function buildRationale(input: {
  category: ObligationIntelligenceCategory;
  amount: number | null;
  confidenceBand: ObligationIntelligenceConfidenceBand;
  daysToAction: number | null;
  recommendedSurfacingTarget: ObligationIntelligenceSurfacingTarget;
}) {
  const parts: string[] = [];
  if (input.daysToAction !== null) {
    if (input.daysToAction <= 1) parts.push("due very soon");
    else if (input.daysToAction <= 3) parts.push("due within 3 days");
    else if (input.daysToAction <= 7) parts.push("due this week");
  } else if (input.category === "STATEMENT") {
    parts.push("statement detected");
  }

  if (typeof input.amount === "number") {
    if (input.amount >= 500) parts.push("high amount");
    else if (input.amount >= 100) parts.push("material amount");
  }

  if (input.confidenceBand !== "HIGH") {
    parts.push(
      input.confidenceBand === "LOW" ? "low confidence requires review" : "moderate confidence"
    );
  }

  parts.push(`surfacing:${input.recommendedSurfacingTarget.toLowerCase()}`);
  return parts;
}

function dueDateScore(daysToAction: number | null) {
  if (daysToAction === null) return 44;
  if (daysToAction <= 0) return 98;
  if (daysToAction <= 1) return 92;
  if (daysToAction <= 3) return 85;
  if (daysToAction <= 7) return 74;
  if (daysToAction <= 14) return 62;
  return 48;
}

function amountScore(amount: number | null) {
  if (amount === null) return 30;
  if (amount >= 700) return 95;
  if (amount >= 300) return 82;
  if (amount >= 100) return 69;
  if (amount >= 40) return 57;
  return 44;
}

function daysUntil(value: string | null, now: Date) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

