import {
  AnchorCategory,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  ObligationSource,
  ObligationType,
  type TrackedAnchor
} from "@prisma/client";

export type AnchorObligationSignal = {
  obligationId: string;
  title: string;
  vendorName: string | null;
  obligationType: ObligationType | null;
  dueDate: Date | null;
  recurrence: string | null;
  amount: number | null;
  currencyCode: string | null;
  confidenceScore: number | null;
  source: ObligationSource | null;
};

export type AnchorObligationMatchStrength = "NONE" | "AMBIGUOUS" | "STRONG";

export type AnchorObligationMatch = {
  strength: AnchorObligationMatchStrength;
  score: number;
  labelScore: number;
  categoryScore: number;
  timingScore: number;
  amountScore: number;
  sourceScore: number;
  linkedObligationMatch: boolean;
};

export function evaluateAnchorObligationMatch(
  anchor: TrackedAnchor,
  signal: AnchorObligationSignal
): AnchorObligationMatch {
  if (anchor.linkedObligationId && anchor.linkedObligationId === signal.obligationId) {
    return {
      strength: "STRONG",
      score: 1,
      labelScore: 1,
      categoryScore: 1,
      timingScore: 1,
      amountScore: 1,
      sourceScore: 1,
      linkedObligationMatch: true
    };
  }

  const labelScore = computeLabelScore(anchor, signal);
  const categoryScore = computeCategoryScore(anchor.category, signal.obligationType);
  const timingScore = computeTimingScore(anchor, signal);
  const amountScore = computeAmountScore(anchor.expectedAmount, signal.amount);
  const sourceScore = computeSourceScore(signal);

  const score = clamp(
    labelScore + categoryScore + timingScore + amountScore + sourceScore,
    0,
    1
  );

  const strength =
    score >= 0.76 && labelScore >= 0.44
      ? "STRONG"
      : score >= 0.58
        ? "AMBIGUOUS"
        : "NONE";

  return {
    strength,
    score,
    labelScore,
    categoryScore,
    timingScore,
    amountScore,
    sourceScore,
    linkedObligationMatch: false
  };
}

export function inferRecurrenceFromText(recurrence: string | null): {
  recurrenceType: AnchorRecurrenceType;
  recurrenceInterval: number | null;
  recurrenceUnit: AnchorRecurrenceUnit | null;
} {
  const normalized = normalizeLabel(recurrence);
  if (!normalized) {
    return {
      recurrenceType: AnchorRecurrenceType.UNKNOWN,
      recurrenceInterval: null,
      recurrenceUnit: null
    };
  }

  if (normalized.includes("week")) {
    return {
      recurrenceType: AnchorRecurrenceType.RECURRING,
      recurrenceInterval: 1,
      recurrenceUnit: AnchorRecurrenceUnit.WEEK
    };
  }

  if (normalized.includes("month")) {
    return {
      recurrenceType: AnchorRecurrenceType.RECURRING,
      recurrenceInterval: 1,
      recurrenceUnit: AnchorRecurrenceUnit.MONTH
    };
  }

  if (normalized.includes("quarter") || normalized.includes("every 3 months")) {
    return {
      recurrenceType: AnchorRecurrenceType.RECURRING,
      recurrenceInterval: 1,
      recurrenceUnit: AnchorRecurrenceUnit.QUARTER
    };
  }

  if (normalized.includes("year") || normalized.includes("annual")) {
    return {
      recurrenceType: AnchorRecurrenceType.RECURRING,
      recurrenceInterval: 1,
      recurrenceUnit: AnchorRecurrenceUnit.YEAR
    };
  }

  if (normalized.includes("one time") || normalized.includes("once")) {
    return {
      recurrenceType: AnchorRecurrenceType.ONE_TIME,
      recurrenceInterval: null,
      recurrenceUnit: null
    };
  }

  return {
    recurrenceType: AnchorRecurrenceType.UNKNOWN,
    recurrenceInterval: null,
    recurrenceUnit: null
  };
}

export function mapAnchorCategoryFromObligationType(
  obligationType: ObligationType | null
): AnchorCategory {
  if (obligationType === ObligationType.SUBSCRIPTION) return AnchorCategory.SUBSCRIPTION;
  if (obligationType === ObligationType.BILL) return AnchorCategory.BILL;
  if (obligationType === ObligationType.RENEWAL) return AnchorCategory.INSURANCE;
  return AnchorCategory.OTHER;
}

function computeLabelScore(anchor: TrackedAnchor, signal: AnchorObligationSignal) {
  const anchorLabel = normalizeLabel(anchor.normalizedLabel ?? anchor.label);
  if (!anchorLabel) return 0;

  const candidates = [signal.vendorName, signal.title]
    .map((value) => normalizeLabel(value))
    .filter((value): value is string => value.length > 0);

  let best = 0;
  for (const candidate of candidates) {
    if (candidate === anchorLabel) {
      best = Math.max(best, 0.62);
      continue;
    }

    if (candidate.includes(anchorLabel) || anchorLabel.includes(candidate)) {
      best = Math.max(best, 0.5);
      continue;
    }

    const overlap = tokenOverlap(anchorLabel, candidate);
    if (overlap >= 0.66) {
      best = Math.max(best, 0.44);
    } else if (overlap >= 0.4) {
      best = Math.max(best, 0.3);
    }
  }

  return best;
}

function computeCategoryScore(
  anchorCategory: AnchorCategory,
  obligationType: ObligationType | null
) {
  if (!obligationType) return 0;
  const mapped = mapAnchorCategoryFromObligationType(obligationType);
  if (anchorCategory === mapped) return 0.18;

  if (
    obligationType === ObligationType.SUBSCRIPTION &&
    anchorCategory === AnchorCategory.MEMBERSHIP
  ) {
    return 0.14;
  }

  if (
    obligationType === ObligationType.BILL &&
    (anchorCategory === AnchorCategory.LOAN ||
      anchorCategory === AnchorCategory.TAX)
  ) {
    return 0.14;
  }

  if (
    obligationType === ObligationType.RENEWAL &&
    (anchorCategory === AnchorCategory.SUBSCRIPTION ||
      anchorCategory === AnchorCategory.MEMBERSHIP)
  ) {
    return 0.08;
  }

  return 0;
}

function computeTimingScore(anchor: TrackedAnchor, signal: AnchorObligationSignal) {
  if (!anchor.nextExpectedDate || !signal.dueDate) {
    return 0;
  }

  const deltaDays = Math.abs(
    Math.round(
      (anchor.nextExpectedDate.getTime() - signal.dueDate.getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );

  if (deltaDays <= 3) return 0.26;
  if (deltaDays <= 10) return 0.18;
  if (deltaDays <= 30) return 0.08;
  return 0;
}

function computeAmountScore(anchorAmount: unknown, obligationAmount: number | null) {
  if (obligationAmount === null || anchorAmount === null || anchorAmount === undefined) {
    return 0;
  }

  const normalizedAnchor = Number(anchorAmount);
  if (!Number.isFinite(normalizedAnchor)) return 0;

  const diff = Math.abs(normalizedAnchor - obligationAmount);
  if (diff <= 1) return 0.08;
  if (diff <= 5) return 0.04;
  return 0;
}

function computeSourceScore(signal: AnchorObligationSignal) {
  if (signal.source !== "EMAIL") return 0;
  const confidence = signal.confidenceScore ?? 0;
  if (confidence >= 0.85) return 0.08;
  if (confidence >= 0.7) return 0.05;
  return 0.02;
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function normalizeLabel(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
