import {
  ImportSourceSubtype,
  ObligationSource,
  ObligationStatus,
  Prisma
} from "@prisma/client";

export type TrustConfidenceBand = "HIGH" | "MEDIUM" | "LOW";
export type TrustSourceType = "EMAIL" | "UPLOAD" | "COMMAND" | "MANUAL";

export type TrustWhy = {
  primaryReason: string;
  signals: string[];
  confidence: number;
  personalizationReason: string | null;
};

export type DecisionTrace = {
  sourceSignals: string[];
  rankingFactors: string[];
  suppressionFactors: string[];
  confidenceDrivers: string[];
};

export type TrustExtractedFields = {
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT" | null;
  title: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  recurrence: string | null;
  description: string | null;
};

export function normalizeConfidenceScore(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return clamp(value, 0, 1);
}

export function toConfidenceBand(value: number | null | undefined): TrustConfidenceBand {
  const score = normalizeConfidenceScore(value);
  if (score >= 0.78) return "HIGH";
  if (score >= 0.48) return "MEDIUM";
  return "LOW";
}

export function sourceTypeFromObligation(input: {
  source: ObligationSource;
  subtype?: ImportSourceSubtype | null;
}): TrustSourceType {
  if (input.subtype === ImportSourceSubtype.EMAIL_FORWARD) return "EMAIL";
  if (input.subtype === ImportSourceSubtype.FILE_UPLOAD) return "UPLOAD";
  if (input.subtype === ImportSourceSubtype.COMMAND_CAPTURE) return "COMMAND";

  if (input.source === "EMAIL") return "EMAIL";
  if (input.source === "DOCUMENT") return "UPLOAD";
  if (input.source === "INFERRED") return "COMMAND";
  return "MANUAL";
}

export function sourceLabelFromType(sourceType: TrustSourceType) {
  if (sourceType === "EMAIL") return "Imported from email";
  if (sourceType === "UPLOAD") return "Extracted from upload";
  if (sourceType === "COMMAND") return "Captured from command";
  return "Created manually";
}

export function getExtractionSummaryRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function getExtractedFieldsFromSummary(
  summary: Record<string, unknown> | null
): TrustExtractedFields | null {
  if (!summary) return null;
  const extracted = asRecord(summary.extracted);
  if (!extracted) return null;

  const type = asString(extracted.type);
  const normalizedType =
    type === "BILL" || type === "SUBSCRIPTION" || type === "RENEWAL" || type === "COMMITMENT"
      ? type
      : null;

  return {
    type: normalizedType,
    title: asNullableString(extracted.title),
    vendor: asNullableString(extracted.vendor),
    amount: asNullableNumber(extracted.amount),
    currency: asNullableString(extracted.currency),
    dueDate: asNullableString(extracted.dueDate),
    recurrence: asNullableString(extracted.recurrence),
    description: asNullableString(extracted.description)
  };
}

export function resolveNeedsReview(input: {
  obligationStatus: ObligationStatus;
  confidenceBand: TrustConfidenceBand;
  parseStatus: string | null;
  conflictDetected: boolean;
  duplicateCandidate: boolean;
}) {
  if (input.obligationStatus === ObligationStatus.DRAFT) return true;
  if (input.conflictDetected || input.duplicateCandidate) return true;
  if (
    input.parseStatus === "PARTIAL" ||
    input.parseStatus === "NEEDS_CONFIRMATION" ||
    input.parseStatus === "FAILED"
  ) {
    return true;
  }
  return input.confidenceBand !== "HIGH";
}

export function toWhyConfidence(input: number) {
  return clamp(Math.round(input * 100) / 100, 0.2, 0.99);
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNullableString(value: unknown) {
  if (typeof value === "string") return value;
  return null;
}

function asNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value));
}
