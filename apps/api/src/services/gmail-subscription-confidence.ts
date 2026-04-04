import type { ConfidenceBand } from "./ingestion.confidence";
import type { GmailSubscriptionClassificationResult } from "./gmail-subscription-classifier";
import type { GmailSubscriptionExtractionResult } from "./gmail-subscription-extractor";

export type GmailSubscriptionConfidenceResult = {
  confidenceScore: number;
  confidenceBand: ConfidenceBand;
  reviewReasons: string[];
  rationaleSignals: string[];
  shouldIgnore: boolean;
};

type ConfidenceInput = {
  classification: GmailSubscriptionClassificationResult;
  extraction: GmailSubscriptionExtractionResult;
  context?: {
    hasExistingMatch?: boolean;
    hasLifecycleConflict?: boolean;
    sourceQualityPenalty?: boolean;
  };
};

export function evaluateGmailSubscriptionConfidence(
  input: ConfidenceInput
): GmailSubscriptionConfidenceResult {
  const { classification, extraction } = input;
  const reviewReasons: string[] = [];
  const rationaleSignals = new Set<string>([
    ...classification.rationaleSignals,
    ...extraction.extractionSignals
  ]);

  const hasVendor = Boolean(extraction.vendor);
  const hasPlan = Boolean(extraction.planName);
  const hasRecurringPrice = extraction.recurringPrice !== null;
  const hasChargedAmount = extraction.amountCharged !== null;
  const hasLifecycleDate = Boolean(
    extraction.renewalDate ||
      extraction.receiptDate ||
      extraction.cancellationEffectiveDate ||
      extraction.trialEndDate
  );
  const hasBillingPeriod = extraction.billingPeriod !== "UNKNOWN";
  const hasAutoRenewSignal = extraction.autoRenewStatus !== "UNKNOWN";
  const hasTrialSignal = extraction.trialStatus !== "NONE";

  const extractionStrength = [
    hasVendor,
    hasPlan,
    hasRecurringPrice,
    hasChargedAmount,
    hasLifecycleDate,
    hasBillingPeriod,
    hasAutoRenewSignal,
    hasTrialSignal
  ].filter(Boolean).length / 8;

  let score =
    classification.classConfidence * 0.36 +
    classification.subscriptionLikelihood * 0.24 +
    extractionStrength * 0.32;

  if (hasVendor) score += 0.04;
  if (hasRecurringPrice && hasBillingPeriod) score += 0.06;
  if (classification.lifecycleEmailType === "RENEWAL" && extraction.renewalDate) score += 0.06;
  if (classification.lifecycleEmailType === "RECEIPT" && hasChargedAmount) score += 0.06;
  if (
    classification.lifecycleEmailType === "CANCELLATION" &&
    (extraction.autoRenewStatus === "OFF" || Boolean(extraction.cancellationEffectiveDate))
  ) {
    score += 0.08;
  }

  if (classification.lifecycleEmailType === "WELCOME") {
    if (!hasRecurringPrice && extraction.trialStatus === "UNKNOWN") {
      reviewReasons.push("Welcome email lacks recurring pricing clarity");
      score -= 0.05;
    }
    if (!hasPlan && !hasBillingPeriod) {
      reviewReasons.push("Welcome signal may be generic account onboarding");
      score -= 0.08;
    }
  }

  if (classification.lifecycleEmailType === "RECEIPT" && !hasRecurringPrice && !hasBillingPeriod) {
    reviewReasons.push("Receipt may be one-time rather than recurring");
    score -= 0.05;
  }

  if (classification.cautionSignals.length > 0) {
    score -= Math.min(0.14, classification.cautionSignals.length * 0.06);
    for (const caution of classification.cautionSignals) {
      rationaleSignals.add(`caution:${caution}`);
    }
  }

  if (input.context?.hasExistingMatch) {
    score += 0.05;
    rationaleSignals.add("matched_existing_subscription");
  }

  if (input.context?.hasLifecycleConflict) {
    score -= 0.14;
    reviewReasons.push("Lifecycle signal conflicts with existing subscription state");
    rationaleSignals.add("lifecycle_conflict_detected");
  }

  if (input.context?.sourceQualityPenalty) {
    score -= 0.08;
    reviewReasons.push("Email body quality was low, requiring review");
    rationaleSignals.add("source_quality_penalty");
  }

  score = clamp(score, 0, 1);
  const confidenceBand = toConfidenceBand(score);

  const hasMeaningfulSignal =
    classification.lifecycleEmailType !== "UNKNOWN" &&
    (hasVendor || hasRecurringPrice || hasChargedAmount || hasLifecycleDate || hasBillingPeriod);

  if (!hasMeaningfulSignal || score < 0.26) {
    reviewReasons.push("Weak subscription lifecycle signal");
  } else if (confidenceBand === "MEDIUM") {
    reviewReasons.push("Subscription lifecycle detection should be reviewed");
  } else if (confidenceBand === "LOW") {
    reviewReasons.push("Low confidence subscription lifecycle extraction");
  }

  return {
    confidenceScore: score,
    confidenceBand,
    reviewReasons: Array.from(new Set(reviewReasons)),
    rationaleSignals: Array.from(rationaleSignals),
    shouldIgnore: !hasMeaningfulSignal && score < 0.35
  };
}

function toConfidenceBand(score: number): ConfidenceBand {
  if (score >= 0.78) return "HIGH";
  if (score >= 0.48) return "MEDIUM";
  return "LOW";
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}
