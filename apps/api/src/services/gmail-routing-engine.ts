import type { ConfidenceBand } from "./ingestion.confidence";
import type { GmailClassifierV2Result } from "./gmail-classifier-v2";
import type { GmailSubscriptionConfidenceResult } from "./gmail-subscription-confidence";
import type { GmailFieldExtractionV2Result } from "./gmail-field-extractor-v2";
import type { GmailLifecycleLinkResult } from "./gmail-lifecycle-linker";

export type GmailRoutingDecision = {
  route: "HIGH" | "MEDIUM" | "LOW";
  action: "AUTO_CREATE_OR_UPDATE" | "REVIEW" | "SUPPRESS";
  reason: string;
  confidenceBand: ConfidenceBand;
};

type RoutingInput = {
  confidence: GmailSubscriptionConfidenceResult;
  classification: GmailClassifierV2Result;
  extraction: GmailFieldExtractionV2Result;
  lifecycleLink: GmailLifecycleLinkResult;
};

export function routeGmailIntelligenceResult(input: RoutingInput): GmailRoutingDecision {
  const score = input.confidence.confidenceScore;
  const confidenceBand = input.confidence.confidenceBand;
  const hasConflict =
    input.lifecycleLink.conflictSignals.length > 0 || input.extraction.conflicts.length > 0;
  const hasMeaningfulSignal =
    input.classification.lifecycleEmailType !== "UNKNOWN" ||
    input.extraction.quality.hasStructuredPrice ||
    input.extraction.quality.hasLifecycleDate ||
    input.extraction.quality.hasVendor;

  if (!hasMeaningfulSignal || input.confidence.shouldIgnore || score < 0.26) {
    return {
      route: "LOW",
      action: "SUPPRESS",
      reason: "low_signal_or_ambiguous_message",
      confidenceBand
    };
  }

  if (confidenceBand === "HIGH" && !hasConflict) {
    return {
      route: "HIGH",
      action: "AUTO_CREATE_OR_UPDATE",
      reason:
        input.lifecycleLink.linkedSubscriptionId !== null
          ? "high_confidence_existing_subscription_link"
          : "high_confidence_lifecycle_detection",
      confidenceBand
    };
  }

  if (confidenceBand === "MEDIUM" || hasConflict) {
    return {
      route: "MEDIUM",
      action: "REVIEW",
      reason: hasConflict ? "conflicting_signals" : "medium_confidence_requires_review",
      confidenceBand
    };
  }

  return {
    route: "LOW",
    action: "REVIEW",
    reason: "low_confidence_requires_review",
    confidenceBand
  };
}
