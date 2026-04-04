import {
  EffortLevel,
  ImpactLevel,
  ObligationSource,
  ObligationStatus,
  ObligationType,
  PredictionType
} from "@prisma/client";

export function canPromotePrediction(prediction: {
  predictionType: PredictionType;
  confidenceScore: number;
}) {
  if (prediction.predictionType === PredictionType.WORKLOAD_WINDOW) {
    return false;
  }
  return prediction.confidenceScore >= 0.52;
}

export function toPromotedObligationInput(input: {
  userId: string;
  prediction: {
    predictionType: PredictionType;
    title: string;
    description: string | null;
    predictedDate: Date | null;
    confidenceScore: number;
    rationale: unknown;
  };
}): {
  userId: string;
  type: ObligationType;
  title: string;
  description: string | null;
  vendor: string | null;
  dueDate: Date | null;
  source: ObligationSource;
  confidenceScore: number;
  urgencyScore: number;
  importanceScore: number;
  effortLevel: EffortLevel;
  impactLevel: ImpactLevel;
  status: ObligationStatus;
} {
  const rationale = asRecord(input.prediction.rationale);
  const obligationType = toObligationType(rationale?.obligationType);
  const vendor = toStringOrNull(rationale?.matchedVendor) ?? toStringOrNull(rationale?.vendor);
  const dueDate = input.prediction.predictedDate;
  const daysUntil = dueDate
    ? (dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    : null;

  const urgencyScore = estimateUrgency(daysUntil);
  const importanceScore = estimateImportance(obligationType, input.prediction.confidenceScore);
  const status = resolveDraftStatus(input.prediction);

  return {
    userId: input.userId,
    type: obligationType,
    title: input.prediction.title,
    description: input.prediction.description,
    vendor,
    dueDate,
    source: "INFERRED",
    confidenceScore: Math.min(0.95, Math.max(0.45, input.prediction.confidenceScore)),
    urgencyScore,
    importanceScore,
    effortLevel: resolveEffortLevel(obligationType),
    impactLevel: resolveImpactLevel(importanceScore),
    status
  };
}

function resolveDraftStatus(prediction: {
  predictionType: PredictionType;
  predictedDate: Date | null;
  confidenceScore: number;
}) {
  if (prediction.confidenceScore >= 0.78) {
    if (
      prediction.predictedDate &&
      prediction.predictedDate.getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000 &&
      prediction.predictionType !== PredictionType.UPCOMING_ATTENTION
    ) {
      return ObligationStatus.ACTIVE;
    }
  }
  return ObligationStatus.DRAFT;
}

function estimateUrgency(daysUntil: number | null) {
  if (daysUntil === null) return 55;
  if (daysUntil <= 0) return 92;
  if (daysUntil <= 1) return 88;
  if (daysUntil <= 3) return 82;
  if (daysUntil <= 7) return 74;
  if (daysUntil <= 14) return 66;
  return 55;
}

function estimateImportance(type: ObligationType, confidenceScore: number) {
  let score =
    type === ObligationType.BILL
      ? 70
      : type === ObligationType.RENEWAL
        ? 66
        : type === ObligationType.SUBSCRIPTION
          ? 60
          : 58;
  score += confidenceScore >= 0.78 ? 8 : confidenceScore >= 0.55 ? 3 : 0;
  return Math.max(40, Math.min(92, score));
}

function resolveEffortLevel(type: ObligationType) {
  if (type === ObligationType.SUBSCRIPTION) return EffortLevel.LOW;
  if (type === ObligationType.COMMITMENT) return EffortLevel.MEDIUM;
  return EffortLevel.MEDIUM;
}

function resolveImpactLevel(importanceScore: number) {
  if (importanceScore >= 80) return ImpactLevel.HIGH;
  if (importanceScore >= 60) return ImpactLevel.MEDIUM;
  return ImpactLevel.LOW;
}

function toObligationType(value: unknown): ObligationType {
  if (value === "BILL" || value === "SUBSCRIPTION" || value === "RENEWAL" || value === "COMMITMENT") {
    return value;
  }
  return ObligationType.COMMITMENT;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
