import type { SupportedObligationType } from "./ingestion.classifier";
import type { IngestionChannel } from "./ingestion-normalizers";
import type { VendorCategory } from "./vendor-profiles";

export type ObligationIntelligenceCategory =
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

export type ObligationIntelligenceConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export type ObligationIntelligencePriorityBand = "URGENT" | "HIGH" | "MEDIUM" | "LOW";

export type ObligationIntelligenceSurfacingTarget =
  | "PULSE"
  | "CONTROL_TOWER_READY"
  | "CONTROL_TOWER_REVIEW"
  | "UPCOMING"
  | "SUPPRESS";

export type ObligationIntelligenceRoute =
  | "PULSE"
  | "READY"
  | "REVIEW"
  | "UPCOMING"
  | "SUPPRESS";

export type ObligationIntelligenceClassified = {
  obligationCategory: ObligationIntelligenceCategory;
  confidenceScore: number;
  confidenceBand: ObligationIntelligenceConfidenceBand;
  rationaleSignals: string[];
  cautionSignals: string[];
  scores: Record<ObligationIntelligenceCategory, number>;
};

export type ObligationIntelligenceExtracted = {
  title: string | null;
  vendorName: string | null;
  vendorNormalizedKey: string | null;
  obligationCategory: ObligationIntelligenceCategory;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  statementDate: string | null;
  paymentDueDate: string | null;
  renewalDate: string | null;
  recurrenceHint: string | null;
  statusHint: "DUE" | "UPCOMING" | "RENEWING" | "STATEMENT_READY" | "UNKNOWN";
  sourceEmailSubject: string | null;
  sourceEmailDate: string | null;
  confidenceScore: number;
  confidenceBand: ObligationIntelligenceConfidenceBand;
  extractionSignals: string[];
  conflictingSignals: string[];
};

export type ObligationIntelligencePriority = {
  priorityScore: number;
  priorityBand: ObligationIntelligencePriorityBand;
  recommendedSurfacingTarget: ObligationIntelligenceSurfacingTarget;
  rationale: string[];
};

export type ObligationIntelligenceRouting = {
  route: ObligationIntelligenceRoute;
  reason: string;
  needsReview: boolean;
  suppress: boolean;
};

export type ObligationIntelligenceSummary = {
  category: ObligationIntelligenceCategory;
  categoryConfidenceScore: number;
  categoryConfidenceBand: ObligationIntelligenceConfidenceBand;
  rationaleSignals: string[];
  cautionSignals: string[];
  extracted: {
    title: string | null;
    vendorName: string | null;
    vendorNormalizedKey: string | null;
    amount: number | null;
    currency: string | null;
    dueDate: string | null;
    statementDate: string | null;
    paymentDueDate: string | null;
    renewalDate: string | null;
    recurrenceHint: string | null;
    statusHint: string;
    sourceEmailSubject: string | null;
    sourceEmailDate: string | null;
    extractionSignals: string[];
    conflictingSignals: string[];
  };
  canonical: {
    obligationType: SupportedObligationType;
    normalizedTitle: string | null;
    normalizedVendor: string | null;
  };
  priority: {
    score: number;
    band: ObligationIntelligencePriorityBand;
    surfacingTarget: ObligationIntelligenceSurfacingTarget;
    rationale: string[];
  };
  routing: {
    route: ObligationIntelligenceRoute;
    reason: string;
    needsReview: boolean;
    suppress: boolean;
  };
  trust: {
    sourceSummary: string[];
    explainability: string[];
  };
  sourceContext: {
    channel: IngestionChannel;
    scopeType: "PERSONAL" | "HOUSEHOLD";
    assigneeSuggestion: string | null;
    vendorCategory: VendorCategory | null;
  };
};

