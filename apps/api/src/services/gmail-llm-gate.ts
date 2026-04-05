import type { GmailClassifierV2Result } from "./gmail-classifier-v2";
import type { GmailFieldExtractionV2Result } from "./gmail-field-extractor-v2";
import type { VendorMatchResult } from "./vendor-matcher";

export type GmailLlmGateResult = {
  shouldUseLlm: boolean;
  reasons: string[];
};

type LlmGateInput = {
  classification: GmailClassifierV2Result;
  extraction: GmailFieldExtractionV2Result;
  vendorMatch: VendorMatchResult;
  bodyText: string;
};

export function evaluateGmailLlmGate(input: LlmGateInput): GmailLlmGateResult {
  const reasons: string[] = [];
  const classType = input.classification.classType;
  const knownVendor =
    input.vendorMatch.outcome === "MATCHED" &&
    (input.vendorMatch.category === "SUBSCRIPTION" ||
      input.vendorMatch.category === "SOFTWARE" ||
      input.vendorMatch.category === "BANK" ||
      input.vendorMatch.category === "CREDIT_CARD");

  if (
    knownVendor &&
    (classType === "SUBSCRIPTION_RECEIPT" ||
      classType === "SUBSCRIPTION_RENEWAL" ||
      classType === "PAYMENT_DUE" ||
      classType === "BILL_STATEMENT") &&
    input.extraction.conflicts.length === 0
  ) {
    return {
      shouldUseLlm: false,
      reasons: []
    };
  }

  if (input.extraction.conflicts.includes("multiple_recurring_price_candidates")) {
    reasons.push("ambiguous_recurring_price");
  }
  if (input.extraction.conflicts.includes("multiple_charged_amount_candidates")) {
    reasons.push("ambiguous_charged_amount");
  }
  if (
    input.classification.lifecycleEmailType !== "UNKNOWN" &&
    !input.extraction.quality.hasLifecycleDate &&
    classType !== "SUBSCRIPTION_WELCOME"
  ) {
    reasons.push("lifecycle_date_missing");
  }
  if (input.extraction.quality.sourceQualityPenalty && input.bodyText.length > 120) {
    reasons.push("messy_html_or_low_quality_text");
  }
  if (input.vendorMatch.outcome === "CONFLICT") {
    reasons.push("vendor_conflict");
  }

  return {
    shouldUseLlm: reasons.length > 0,
    reasons
  };
}
