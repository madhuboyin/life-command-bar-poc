import type { GmailSubscriptionConfidenceResult } from "./gmail-subscription-confidence";
import { evaluateGmailSubscriptionConfidence } from "./gmail-subscription-confidence";
import type { GmailClassifierV2Result } from "./gmail-classifier-v2";
import type { GmailFieldExtractionV2Result } from "./gmail-field-extractor-v2";
import type { VendorMatchResult } from "./vendor-matcher";
import type { GmailLifecycleLinkResult } from "./gmail-lifecycle-linker";

type ConfidenceInput = {
  classification: GmailClassifierV2Result;
  extractionV2: GmailFieldExtractionV2Result;
  vendorMatch: VendorMatchResult;
  lifecycleLink: GmailLifecycleLinkResult;
  history: {
    hasPriorVendor: boolean;
    isUnknownVendor: boolean;
    hasRejectedHistory: boolean;
  };
};

export function evaluateGmailConfidenceV2(input: ConfidenceInput): GmailSubscriptionConfidenceResult {
  const base = evaluateGmailSubscriptionConfidence({
    classification: {
      lifecycleEmailType: input.classification.lifecycleEmailType,
      subscriptionLikelihood: input.classification.subscriptionLikelihood,
      classConfidence: input.classification.classConfidence,
      rationaleSignals: input.classification.rationaleSignals,
      cautionSignals: input.classification.cautionSignals,
      classScores: {
        WELCOME: input.classification.classScores.SUBSCRIPTION_WELCOME,
        RENEWAL: input.classification.classScores.SUBSCRIPTION_RENEWAL,
        RECEIPT: input.classification.classScores.SUBSCRIPTION_RECEIPT,
        CANCELLATION: input.classification.classScores.SUBSCRIPTION_CANCELLATION,
        UNKNOWN: input.classification.classScores.UNKNOWN
      }
    },
    extraction: input.extractionV2.extraction,
    context: {
      hasExistingMatch: input.lifecycleLink.linkedSubscriptionId !== null,
      hasLifecycleConflict: input.lifecycleLink.conflictSignals.length > 0,
      sourceQualityPenalty: input.extractionV2.quality.sourceQualityPenalty,
      history: input.history
    }
  });

  const reviewReasons = new Set(base.reviewReasons);
  const rationaleSignals = new Set(base.rationaleSignals);
  let score = base.confidenceScore;

  if (input.vendorMatch.outcome === "MATCHED") {
    score += 0.08;
    rationaleSignals.add("vendor_profile_match");
  } else if (input.vendorMatch.outcome === "CONFLICT") {
    score -= 0.14;
    reviewReasons.add("Vendor profile conflict needs review");
    rationaleSignals.add("vendor_profile_conflict");
  } else if (input.vendorMatch.outcome === "SUPPRESSED") {
    score -= 0.2;
    reviewReasons.add("Vendor suppressed by negative keyword signals");
    rationaleSignals.add("vendor_profile_suppressed");
  }

  if (
    (input.vendorMatch.category === "BANK" || input.vendorMatch.category === "CREDIT_CARD") &&
    input.classification.classType.startsWith("SUBSCRIPTION")
  ) {
    score -= 0.18;
    reviewReasons.add("Financial vendor mismatch with subscription classification");
    rationaleSignals.add("financial_vendor_category_mismatch");
  }

  if (input.lifecycleLink.linkedSubscriptionId && input.lifecycleLink.matchScore >= 0.72) {
    score += 0.05;
    rationaleSignals.add("linked_existing_subscription");
  }

  if (input.extractionV2.conflicts.length > 0) {
    score -= Math.min(0.2, input.extractionV2.conflicts.length * 0.07);
    for (const conflict of input.extractionV2.conflicts) {
      reviewReasons.add(`Extraction conflict: ${conflict.replace(/_/g, " ")}`);
      rationaleSignals.add(`extraction_conflict:${conflict}`);
    }
  }

  score = clamp(score, 0, 1);
  const confidenceBand = toBand(score);
  if (confidenceBand !== "HIGH" && !input.classification.classType.startsWith("SUBSCRIPTION")) {
    reviewReasons.add("Non-subscription lifecycle class routed conservatively");
  }

  const shouldIgnore =
    base.shouldIgnore ||
    (input.classification.classType === "UNKNOWN" &&
      !input.extractionV2.quality.hasStructuredPrice &&
      !input.extractionV2.quality.hasLifecycleDate);

  return {
    confidenceScore: score,
    confidenceBand,
    reviewReasons: Array.from(reviewReasons),
    rationaleSignals: Array.from(rationaleSignals),
    shouldIgnore
  };
}

function toBand(score: number): "HIGH" | "MEDIUM" | "LOW" {
  if (score >= 0.78) return "HIGH";
  if (score >= 0.48) return "MEDIUM";
  return "LOW";
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
