import type { EmotionalState } from "./emotional-trust.dictionary";
import {
  toConfidenceBand,
  toEmotionalActionType,
  toEmotionalRiskLevel,
  shouldBeSafeToWait,
  type ConfidenceBand
} from "./emotional-trust.mapper";

type Input = {
  emotionalState?: EmotionalState | null;
  confidenceBand?: ConfidenceBand | number | null;
  needsReview?: boolean;
  actionType?: string | null;
  riskLevel?: string | null;
  priorityBand?: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueAt?: string | null;
  renewsAt?: string | null;
  canWait?: boolean | null;
  scopeType?: "PERSONAL" | "HOUSEHOLD" | null;
  assigneeName?: string | null;
  remainingCount?: number | null;
  isCompletion?: boolean;
  didConfirmAction?: boolean;
};

export function buildEmotionalState(input: Input): EmotionalState {
  if (input.emotionalState) return input.emotionalState;

  const confidenceBand = toConfidenceBand(input.confidenceBand);
  const actionType = toEmotionalActionType(input.actionType);
  const riskLevel = toEmotionalRiskLevel({
    riskLevel: input.riskLevel,
    priorityBand: input.priorityBand,
    dueAt: input.dueAt,
    renewsAt: input.renewsAt
  });

  if (input.isCompletion) {
    if ((input.remainingCount ?? 0) > 0) return "ACTION_CONFIRMED";
    return "DONE_FOR_NOW";
  }

  if (input.didConfirmAction) {
    return "ACTION_CONFIRMED";
  }

  if (input.scopeType === "HOUSEHOLD") {
    return "SHARED_RESPONSIBILITY";
  }

  if (actionType === "KEEP" || actionType === "CANCEL") {
    return "DECISION_NOW";
  }

  if (riskLevel === "HIGH") return "HIGH_RISK_BUT_CONTROLLABLE";
  if (riskLevel === "MEDIUM") return "MEDIUM_RISK";

  const safeToWait = shouldBeSafeToWait({
    riskLevel,
    confidenceBand,
    needsReview: input.needsReview,
    canWait: input.canWait
  });

  if (safeToWait) return "SAFE_TO_WAIT";

  if (input.needsReview) return "REVIEW_NEEDED";
  if (confidenceBand === "LOW") return "CALM_UNCERTAIN";
  if (confidenceBand === "MEDIUM") return "REVIEW_NEEDED";
  if (riskLevel === "LOW") return "LOW_RISK";
  return "CALM_CLEAR";
}
