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

export type TrustObligationIntelligence = {
  category:
    | "SUBSCRIPTION"
    | "BILL"
    | "STATEMENT"
    | "PAYMENT_DUE"
    | "UTILITY"
    | "TELECOM"
    | "INSURANCE"
    | "CREDIT_CARD"
    | "LOAN"
    | "SERVICE_RENEWAL"
    | "COMPLIANCE"
    | "COMMITMENT"
    | "UNKNOWN";
  categoryConfidenceScore: number;
  categoryConfidenceBand: TrustConfidenceBand;
  priority: {
    score: number;
    band: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
    surfacingTarget:
      | "PULSE"
      | "CONTROL_TOWER_READY"
      | "CONTROL_TOWER_REVIEW"
      | "UPCOMING"
      | "SUPPRESS";
    rationale: string[];
  };
  routing: {
    route: "PULSE" | "READY" | "REVIEW" | "UPCOMING" | "SUPPRESS";
    reason: string;
    needsReview: boolean;
    suppress: boolean;
  };
  trust: {
    sourceSummary: string[];
    explainability: string[];
  };
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
  if (input.subtype === ImportSourceSubtype.GMAIL_READONLY) return "EMAIL";
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

export function getObligationIntelligenceFromSummary(
  summary: Record<string, unknown> | null
): TrustObligationIntelligence | null {
  if (!summary) return null;
  const intelligence = asRecord(summary.obligationIntelligence);
  if (!intelligence) return null;

  const category = asString(intelligence.category);
  if (!category) return null;
  const categoryConfidenceScore = normalizeConfidenceScore(asNullableNumber(intelligence.categoryConfidenceScore));
  const categoryConfidenceBand = toConfidenceBand(categoryConfidenceScore);
  const priority = asRecord(intelligence.priority);
  const routing = asRecord(intelligence.routing);
  const trust = asRecord(intelligence.trust);

  const priorityBand = asString(priority?.band);
  const surfacingTarget = asString(priority?.surfacingTarget);
  const route = asString(routing?.route);

  if (
    (priorityBand !== "URGENT" && priorityBand !== "HIGH" && priorityBand !== "MEDIUM" && priorityBand !== "LOW") ||
    (surfacingTarget !== "PULSE" &&
      surfacingTarget !== "CONTROL_TOWER_READY" &&
      surfacingTarget !== "CONTROL_TOWER_REVIEW" &&
      surfacingTarget !== "UPCOMING" &&
      surfacingTarget !== "SUPPRESS") ||
    (route !== "PULSE" &&
      route !== "READY" &&
      route !== "REVIEW" &&
      route !== "UPCOMING" &&
      route !== "SUPPRESS")
  ) {
    return null;
  }

  return {
    category: isAllowedCategory(category) ? category : "UNKNOWN",
    categoryConfidenceScore,
    categoryConfidenceBand,
    priority: {
      score: asNullableNumber(priority?.score) ?? 0,
      band: priorityBand,
      surfacingTarget,
      rationale: asStringArray(priority?.rationale)
    },
    routing: {
      route,
      reason: asString(routing?.reason) ?? "unspecified",
      needsReview: Boolean(routing?.needsReview),
      suppress: Boolean(routing?.suppress)
    },
    trust: {
      sourceSummary: asStringArray(trust?.sourceSummary),
      explainability: asStringArray(trust?.explainability)
    }
  };
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

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isAllowedCategory(
  value: string
): value is TrustObligationIntelligence["category"] {
  return (
    value === "SUBSCRIPTION" ||
    value === "BILL" ||
    value === "STATEMENT" ||
    value === "PAYMENT_DUE" ||
    value === "UTILITY" ||
    value === "TELECOM" ||
    value === "INSURANCE" ||
    value === "CREDIT_CARD" ||
    value === "LOAN" ||
    value === "SERVICE_RENEWAL" ||
    value === "COMPLIANCE" ||
    value === "COMMITMENT" ||
    value === "UNKNOWN"
  );
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value));
}
