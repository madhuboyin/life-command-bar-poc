import type { SupportedObligationType } from "./ingestion.classifier";
import type { IngestionChannel } from "./ingestion-normalizers";
import type { VendorCategory } from "./vendor-profiles";
import {
  classifyObligationCategory
} from "./obligation-classifier";
import { extractObligationIntelligenceFields } from "./obligation-extractor";
import { normalizeObligationIntelligence } from "./obligation-normalizer";
import { prioritizeObligation } from "./obligation-prioritizer";
import { routeObligationIntelligence } from "./obligation-router";
import type {
  ObligationIntelligenceSummary
} from "./obligation-intelligence.types";

type BaseClassification = {
  type: SupportedObligationType;
};

type BaseExtracted = {
  type: SupportedObligationType;
  title: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  recurrence: string | null;
  description: string | null;
};

type BaseConfidence = {
  score: number;
  band: "HIGH" | "MEDIUM" | "LOW";
};

type AnalyzeInput = {
  channel: IngestionChannel;
  rawText: string;
  normalizedText: string;
  titleHint: string | null;
  metadata: Record<string, unknown>;
  classification: BaseClassification;
  extracted: BaseExtracted;
  confidence: BaseConfidence;
  conflictDetected: boolean;
  duplicateDetected: boolean;
  needsReview: boolean;
};

export type ObligationIntelligenceAnalysis = {
  summary: ObligationIntelligenceSummary;
  adjustedExtracted: BaseExtracted;
  adjustedConfidence: BaseConfidence;
  routingNeedsReview: boolean;
  suppressCandidate: boolean;
  priorityScore: number;
  priorityBand: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
};

export class ObligationIntelligenceService {
  analyze(input: AnalyzeInput): ObligationIntelligenceAnalysis {
    const now = new Date();
    const lifecycle = asRecord(input.metadata.subscriptionLifecycle);
    const lifecycleV2 = asRecord(lifecycle?.intelligenceV2);
    const vendorV2 = asRecord(lifecycleV2?.vendor);
    const vendorCategory = toVendorCategory(vendorV2?.category);
    const lifecycleEmailType = asString(lifecycle?.lifecycleEmailType);
    const matchedQueryKey = asString(input.metadata.matchedQueryKey);

    const classified = classifyObligationCategory({
      normalizedText: input.normalizedText,
      titleHint: input.titleHint,
      matchedQueryKey,
      vendorCategory,
      lifecycleEmailType,
      baseTypeHint: input.classification.type
    });

    const extracted = extractObligationIntelligenceFields({
      rawText: input.rawText,
      normalizedText: input.normalizedText,
      titleHint: input.titleHint,
      metadata: input.metadata,
      classified,
      now
    });

    const normalized = normalizeObligationIntelligence({
      category: classified.obligationCategory,
      extracted,
      fallbackType: input.classification.type,
      fallbackTitle: input.extracted.title,
      fallbackVendor: input.extracted.vendor
    });

    const priority = prioritizeObligation({
      category: classified.obligationCategory,
      confidenceBand: classified.confidenceBand,
      confidenceScore: classified.confidenceScore,
      amount: extracted.amount ?? input.extracted.amount,
      dueDate: extracted.dueDate ?? input.extracted.dueDate,
      paymentDueDate: extracted.paymentDueDate,
      renewalDate: extracted.renewalDate,
      statementDate: extracted.statementDate,
      recurrenceHint: extracted.recurrenceHint ?? input.extracted.recurrence,
      needsReview: input.needsReview,
      alreadyAcknowledged: false,
      now
    });

    const routing = routeObligationIntelligence({
      classified,
      extracted,
      priority,
      conflictDetected: input.conflictDetected,
      duplicateDetected: input.duplicateDetected
    });

    const adjustedExtracted = applyIntelligenceToExtracted(input.extracted, {
      canonicalType: normalized.canonicalType,
      title: normalized.normalizedTitle,
      vendor: normalized.normalizedVendor,
      amount: extracted.amount,
      currency: extracted.currency,
      dueDate: extracted.paymentDueDate ?? extracted.renewalDate ?? extracted.dueDate ?? null,
      recurrence: extracted.recurrenceHint
    });

    const adjustedConfidenceScore = clamp(
      input.confidence.score * 0.72 +
        classified.confidenceScore * 0.16 +
        extracted.confidenceScore * 0.12 -
        extracted.conflictingSignals.length * 0.08,
      0.16,
      0.98
    );
    const adjustedConfidenceBand =
      adjustedConfidenceScore >= 0.78 ? "HIGH" : adjustedConfidenceScore >= 0.48 ? "MEDIUM" : "LOW";
    const adjustedConfidence: BaseConfidence = {
      score: adjustedConfidenceScore,
      band: adjustedConfidenceBand
    };

    const explainability = buildExplainability({
      category: classified.obligationCategory,
      rationaleSignals: classified.rationaleSignals,
      cautionSignals: classified.cautionSignals,
      extractionSignals: extracted.extractionSignals,
      vendorCategory
    });

    const summary: ObligationIntelligenceSummary = {
      category: classified.obligationCategory,
      categoryConfidenceScore: classified.confidenceScore,
      categoryConfidenceBand: classified.confidenceBand,
      rationaleSignals: classified.rationaleSignals,
      cautionSignals: classified.cautionSignals,
      extracted: {
        title: extracted.title,
        vendorName: extracted.vendorName,
        vendorNormalizedKey: normalized.vendorNormalizedKey,
        amount: extracted.amount,
        currency: extracted.currency,
        dueDate: extracted.dueDate,
        statementDate: extracted.statementDate,
        paymentDueDate: extracted.paymentDueDate,
        renewalDate: extracted.renewalDate,
        recurrenceHint: extracted.recurrenceHint,
        statusHint: extracted.statusHint,
        sourceEmailSubject: extracted.sourceEmailSubject,
        sourceEmailDate: extracted.sourceEmailDate,
        extractionSignals: extracted.extractionSignals,
        conflictingSignals: extracted.conflictingSignals
      },
      canonical: {
        obligationType: normalized.canonicalType,
        normalizedTitle: normalized.normalizedTitle,
        normalizedVendor: normalized.normalizedVendor
      },
      priority: {
        score: priority.priorityScore,
        band: priority.priorityBand,
        surfacingTarget: priority.recommendedSurfacingTarget,
        rationale: priority.rationale
      },
      routing: {
        route: routing.route,
        reason: routing.reason,
        needsReview: routing.needsReview,
        suppress: routing.suppress
      },
      trust: {
        sourceSummary: buildSourceSummary({
          category: classified.obligationCategory,
          dueDate: extracted.paymentDueDate ?? extracted.renewalDate ?? extracted.dueDate,
          amount: extracted.amount,
          sourceEmailSubject: extracted.sourceEmailSubject
        }),
        explainability
      },
      sourceContext: {
        channel: input.channel,
        scopeType: "PERSONAL",
        assigneeSuggestion: null,
        vendorCategory
      }
    };

    return {
      summary,
      adjustedExtracted,
      adjustedConfidence,
      routingNeedsReview: routing.needsReview,
      suppressCandidate: routing.suppress,
      priorityScore: priority.priorityScore,
      priorityBand: priority.priorityBand
    };
  }
}

function applyIntelligenceToExtracted(
  extracted: BaseExtracted,
  intelligence: {
    canonicalType: SupportedObligationType;
    title: string | null;
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    dueDate: string | null;
    recurrence: string | null;
  }
) {
  return {
    ...extracted,
    type: intelligence.canonicalType,
    title: extracted.title ?? intelligence.title,
    vendor: extracted.vendor ?? intelligence.vendor,
    amount: extracted.amount ?? intelligence.amount,
    currency: extracted.currency ?? intelligence.currency,
    dueDate: extracted.dueDate ?? intelligence.dueDate,
    recurrence: extracted.recurrence ?? intelligence.recurrence
  };
}

function buildSourceSummary(input: {
  category: string;
  dueDate: string | null;
  amount: number | null;
  sourceEmailSubject: string | null;
}) {
  const parts: string[] = [];
  parts.push(`Detected from Gmail ${input.category.toLowerCase().replace(/_/g, " ")} signal`);
  if (input.dueDate) {
    const date = new Date(input.dueDate);
    if (!Number.isNaN(date.getTime())) {
      parts.push(`Action timing: ${date.toISOString().slice(0, 10)}`);
    }
  }
  if (typeof input.amount === "number") {
    parts.push(`Amount evidence found: ${input.amount.toFixed(2)}`);
  }
  if (input.sourceEmailSubject) {
    parts.push(`Source email: ${input.sourceEmailSubject.slice(0, 120)}`);
  }
  return parts;
}

function buildExplainability(input: {
  category: string;
  rationaleSignals: string[];
  cautionSignals: string[];
  extractionSignals: string[];
  vendorCategory: VendorCategory | null;
}) {
  const lines: string[] = [];
  lines.push(`Category classified as ${input.category.toLowerCase().replace(/_/g, " ")}`);
  if (input.vendorCategory && input.vendorCategory !== "UNKNOWN") {
    lines.push(`Vendor profile matched ${input.vendorCategory.toLowerCase().replace(/_/g, " ")}`);
  }
  for (const signal of input.rationaleSignals.slice(0, 4)) {
    lines.push(signal.replace(/_/g, " "));
  }
  for (const signal of input.extractionSignals.slice(0, 3)) {
    lines.push(signal.replace(/_/g, " "));
  }
  for (const caution of input.cautionSignals.slice(0, 2)) {
    lines.push(`caution: ${caution.replace(/_/g, " ")}`);
  }
  return Array.from(new Set(lines));
}

function toVendorCategory(value: unknown): VendorCategory | null {
  if (
    value === "SUBSCRIPTION" ||
    value === "BANK" ||
    value === "CREDIT_CARD" ||
    value === "UTILITY" ||
    value === "TELECOM" ||
    value === "SOFTWARE" ||
    value === "RETAIL" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  return null;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

