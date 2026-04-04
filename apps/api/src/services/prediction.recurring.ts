import {
  MemoryPatternType,
  ObligationStatus,
  PredictionReferenceType,
  PredictionType
} from "@prisma/client";
import {
  buildPredictionRationaleSummary,
  clamp,
  round,
  toPredictionConfidenceBand
} from "./prediction.rationale";
import type { PredictionDraft } from "./prediction.types";

type RecurringPatternInput = {
  id: string;
  patternType: MemoryPatternType;
  referenceId: string;
  patternData: unknown;
  confidence: number;
  frequency: number;
  updatedAt: Date;
};

type OpenObligationInput = {
  id: string;
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  title: string;
  vendor: string | null;
  dueDate: Date | null;
  status: ObligationStatus;
};

export function buildRecurringPredictions(input: {
  patterns: RecurringPatternInput[];
  openObligations: OpenObligationInput[];
  now: Date;
}): PredictionDraft[] {
  const drafts: PredictionDraft[] = [];

  const recurringPatterns = input.patterns.filter(
    (item) => item.patternType === MemoryPatternType.RECURRING_OBLIGATION
  );

  for (const pattern of recurringPatterns) {
    const data = asRecord(pattern.patternData);
    if (!data) continue;

    const vendor = toStringOrNull(data.vendor);
    const vendorKey = toStringOrNull(data.vendorKey);
    const obligationType = toObligationType(data.obligationType);
    const expectedNextOccurrence = toDateOrNull(data.expectedNextOccurrence);
    const observedCount = toNumberOrNull(data.occurrenceCount) ?? pattern.frequency;
    const averageIntervalDays = toNumberOrNull(data.averageIntervalDays);
    const intervalVarianceDays = toNumberOrNull(data.intervalVarianceDays);
    const typicalAmount = toNumberOrNull(data.typicalAmount);

    if (!vendor || !vendorKey || !obligationType || !expectedNextOccurrence) {
      continue;
    }
    if (observedCount < 2) continue;

    const daysUntil = diffDays(expectedNextOccurrence, input.now);
    const matchingNearby = findNearbyOpenObligation({
      openObligations: input.openObligations,
      vendorKey,
      obligationType,
      expectedDate: expectedNextOccurrence
    });

    let confidenceScore = pattern.confidence;
    if (observedCount >= 4) confidenceScore += 0.05;
    if ((intervalVarianceDays ?? 999) <= 6) confidenceScore += 0.06;
    else if ((intervalVarianceDays ?? 999) > 18) confidenceScore -= 0.08;

    if (daysUntil < -7 && !matchingNearby) confidenceScore -= 0.08;
    if (Math.abs(daysUntil) <= 14) confidenceScore += 0.04;
    confidenceScore = clamp(round(confidenceScore, 4), 0.35, 0.96);

    const rationale = {
      observedCount,
      averageIntervalDays: averageIntervalDays ?? null,
      intervalVariance: intervalVarianceDays ?? null,
      lastObservedDate: toStringOrNull(data.lastObservedDate) ?? null,
      matchedVendor: vendor,
      vendorKey,
      obligationType,
      expectedNextOccurrence: expectedNextOccurrence.toISOString(),
      typicalAmount,
      supportingSignals: [
        `pattern_confidence:${Math.round(pattern.confidence * 100)}`,
        `days_until:${Math.round(daysUntil)}`
      ],
      memoryPatternId: pattern.id,
      reason: `${vendor} usually appears every ${Math.round(averageIntervalDays ?? 30)} days.`
    };

    drafts.push({
      predictionType: PredictionType.RECURRING_NEXT_OCCURRENCE,
      referenceType: PredictionReferenceType.MEMORY_PATTERN,
      referenceId: pattern.id,
      title: `${vendor} likely next ${toTypeLabel(obligationType).toLowerCase()}`,
      description: `${vendor} is likely to appear around ${formatDate(expectedNextOccurrence)} based on prior occurrences.`,
      predictedDate: expectedNextOccurrence,
      confidenceScore,
      confidenceBand: toPredictionConfidenceBand(confidenceScore),
      rationale,
      rationaleSummary: buildPredictionRationaleSummary(rationale)
    });

    const shouldCreateMissing =
      !matchingNearby &&
      daysUntil <= 14 &&
      daysUntil >= -10 &&
      confidenceScore >= 0.62;
    if (shouldCreateMissing) {
      const missingConfidence = clamp(round(confidenceScore - 0.04, 4), 0.4, 0.92);
      const missingRationale = {
        ...rationale,
        reason: `No current ${toTypeLabel(obligationType).toLowerCase()} found, but this pattern is expected soon.`
      };

      drafts.push({
        predictionType: PredictionType.MISSING_EXPECTED_OBLIGATION,
        referenceType: PredictionReferenceType.MEMORY_PATTERN,
        referenceId: pattern.id,
        title: `${vendor} likely coming soon`,
        description: `A new ${toTypeLabel(obligationType).toLowerCase()} for ${vendor} is likely soon, but not yet captured.`,
        predictedDate: expectedNextOccurrence,
        confidenceScore: missingConfidence,
        confidenceBand: toPredictionConfidenceBand(missingConfidence),
        rationale: missingRationale,
        rationaleSummary: buildPredictionRationaleSummary(missingRationale)
      });
    }

    const shouldCreateUpcomingAttention =
      daysUntil >= 0 && daysUntil <= 30 && confidenceScore >= 0.52;
    if (shouldCreateUpcomingAttention) {
      const upcomingConfidence = clamp(round(confidenceScore - 0.08, 4), 0.35, 0.9);
      const upcomingRationale = {
        ...rationale,
        windowDays: 30,
        reason: `${vendor} is likely within the next month and worth preparing for.`
      };

      drafts.push({
        predictionType: PredictionType.UPCOMING_ATTENTION,
        referenceType: PredictionReferenceType.MEMORY_PATTERN,
        referenceId: `attention:${pattern.id}`,
        title: `Prepare for ${vendor}`,
        description: `${vendor} usually appears around this time. Preparing now can avoid urgency.`,
        predictedDate: expectedNextOccurrence,
        predictionWindowStart: input.now,
        predictionWindowEnd: addDays(input.now, 30),
        confidenceScore: upcomingConfidence,
        confidenceBand: toPredictionConfidenceBand(upcomingConfidence),
        rationale: upcomingRationale,
        rationaleSummary: buildPredictionRationaleSummary(upcomingRationale)
      });
    }
  }

  return drafts;
}

function findNearbyOpenObligation(input: {
  openObligations: OpenObligationInput[];
  vendorKey: string;
  obligationType: OpenObligationInput["type"];
  expectedDate: Date;
}) {
  const start = addDays(input.expectedDate, -14).getTime();
  const end = addDays(input.expectedDate, 14).getTime();

  return input.openObligations.find((item) => {
    if (item.type !== input.obligationType) return false;
    if (!item.vendor) return false;
    if (normalizeKey(item.vendor) !== input.vendorKey) return false;
    if (!item.dueDate) return true;
    const due = item.dueDate.getTime();
    return due >= start && due <= end;
  });
}

function toTypeLabel(type: OpenObligationInput["type"]) {
  if (type === "BILL") return "Bill";
  if (type === "SUBSCRIPTION") return "Subscription";
  if (type === "RENEWAL") return "Renewal";
  return "Commitment";
}

function diffDays(left: Date, right: Date) {
  return (left.getTime() - right.getTime()) / (1000 * 60 * 60 * 24);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toDateOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toObligationType(value: unknown): OpenObligationInput["type"] | null {
  if (value === "BILL" || value === "SUBSCRIPTION" || value === "RENEWAL" || value === "COMMITMENT") {
    return value;
  }
  return null;
}
