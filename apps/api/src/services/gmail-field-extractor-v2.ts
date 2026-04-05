import {
  extractGmailSubscriptionDetails,
  type GmailSubscriptionExtractionResult
} from "./gmail-subscription-extractor";
import type { GmailClassifierV2Result } from "./gmail-classifier-v2";
import type { VendorMatchResult } from "./vendor-matcher";

export type GmailFieldExtractionV2Result = {
  extraction: GmailSubscriptionExtractionResult;
  conflicts: string[];
  quality: {
    hasStructuredPrice: boolean;
    hasLifecycleDate: boolean;
    hasVendor: boolean;
    hasPlan: boolean;
    sourceQualityPenalty: boolean;
  };
  rationale: string[];
};

type ExtractionInput = {
  classification: GmailClassifierV2Result;
  vendorMatch: VendorMatchResult;
  subject: string;
  from: string;
  bodyText: string;
  snippet: string;
  messageDate: string | null;
};

type PriceCandidate = {
  amount: number;
  context: string;
};

export function extractGmailFieldsV2(input: ExtractionInput): GmailFieldExtractionV2Result {
  const baseline = extractGmailSubscriptionDetails({
    lifecycleEmailType: input.classification.lifecycleEmailType,
    subject: input.subject,
    from: input.from,
    bodyText: input.bodyText,
    snippet: input.snippet,
    messageDate: input.messageDate
  });

  const fullText = normalize([input.subject, input.bodyText, input.snippet].join("\n"));
  const conflicts: string[] = [];
  const rationale: string[] = [];

  const recurringCandidates = findPriceCandidates(
    fullText,
    /(monthly|annual|yearly|quarterly|renews?|subscription|membership|plan|auto[\s-]?renew)/i
  );
  const chargedCandidates = findPriceCandidates(
    fullText,
    /(charged|invoice|receipt|payment(?:\s+received)?|you paid|paid)/i
  );
  const introCandidates = findPriceCandidates(fullText, /(trial|intro|starting|first month|first year)/i);

  const recurringDistinct = distinctAmounts(recurringCandidates);
  const chargedDistinct = distinctAmounts(chargedCandidates);

  let recurringPrice = baseline.recurringPrice;
  if (recurringPrice === null && recurringCandidates.length === 1) {
    recurringPrice = recurringCandidates[0].amount;
    rationale.push("inferred_recurring_price_from_context");
  } else if (recurringDistinct.length > 1) {
    conflicts.push("multiple_recurring_price_candidates");
  }

  let amountCharged = baseline.amountCharged;
  if (amountCharged === null && chargedCandidates.length === 1) {
    amountCharged = chargedCandidates[0].amount;
    rationale.push("inferred_charged_amount_from_context");
  } else if (chargedDistinct.length > 1) {
    conflicts.push("multiple_charged_amount_candidates");
  }

  let introPrice = baseline.introPrice;
  if (introPrice === null && introCandidates.length === 1) {
    introPrice = introCandidates[0].amount;
    rationale.push("inferred_intro_price_from_context");
  }

  let vendor = baseline.vendor;
  if (input.vendorMatch.outcome === "MATCHED" && input.vendorMatch.canonicalName) {
    if (!vendor || normalizeKey(vendor) !== normalizeKey(input.vendorMatch.canonicalName)) {
      vendor = input.vendorMatch.canonicalName;
      rationale.push("vendor_normalized_from_vendor_profile");
    }
  }

  const vendorKey = input.vendorMatch.vendorKey ?? baseline.vendorKey;
  const sourceQualityPenalty = fullText.length < 42 || mostlyHtmlNoise(input.bodyText);
  if (sourceQualityPenalty) {
    conflicts.push("low_source_text_quality");
  }

  const extraction: GmailSubscriptionExtractionResult = {
    ...baseline,
    vendor,
    vendorKey,
    introPrice,
    recurringPrice,
    amountCharged,
    extractionSignals: unique([
      ...baseline.extractionSignals,
      ...rationale.map((entry) => `v2:${entry}`)
    ])
  };

  return {
    extraction,
    conflicts: unique(conflicts),
    quality: {
      hasStructuredPrice:
        extraction.recurringPrice !== null ||
        extraction.amountCharged !== null ||
        extraction.introPrice !== null,
      hasLifecycleDate:
        Boolean(extraction.renewalDate) ||
        Boolean(extraction.cancellationEffectiveDate) ||
        Boolean(extraction.receiptDate) ||
        Boolean(extraction.trialEndDate),
      hasVendor: Boolean(extraction.vendor),
      hasPlan: Boolean(extraction.planName),
      sourceQualityPenalty
    },
    rationale: unique(rationale)
  };
}

function findPriceCandidates(text: string, contextMatcher: RegExp) {
  const candidates: PriceCandidate[] = [];
  const pattern =
    /\b(?:USD|EUR|GBP|CAD|AUD)\s*([0-9]+(?:\.[0-9]{1,2})?)|([$€£])\s*([0-9]+(?:\.[0-9]{1,2})?)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const amountRaw = match[1] ?? match[3];
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) continue;
    const index = match.index;
    const context = text.slice(Math.max(0, index - 52), Math.min(text.length, index + 72));
    if (!contextMatcher.test(context)) continue;
    candidates.push({ amount, context });
  }
  return candidates;
}

function distinctAmounts(items: PriceCandidate[]) {
  const rounded = items.map((item) => Math.round(item.amount * 100) / 100);
  return Array.from(new Set(rounded));
}

function mostlyHtmlNoise(bodyText: string) {
  const text = bodyText || "";
  if (!text) return true;
  const htmlTagCount = (text.match(/<[^>]+>/g) ?? []).length;
  const lineBreakCount = (text.match(/\n/g) ?? []).length;
  return htmlTagCount > 10 && lineBreakCount < 4;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
