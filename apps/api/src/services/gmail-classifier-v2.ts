import type { VendorCategory } from "./vendor-profiles";
import type { VendorMatchResult } from "./vendor-matcher";
import type { GmailSubscriptionLifecycleEmailType } from "./gmail-subscription-classifier";

export type GmailIntelligenceClassType =
  | "SUBSCRIPTION_WELCOME"
  | "SUBSCRIPTION_RENEWAL"
  | "SUBSCRIPTION_RECEIPT"
  | "SUBSCRIPTION_CANCELLATION"
  | "BILL_STATEMENT"
  | "PAYMENT_DUE"
  | "GENERIC_RECEIPT"
  | "UNKNOWN";

export type GmailClassifierV2Result = {
  classType: GmailIntelligenceClassType;
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  subscriptionLikelihood: number;
  classConfidence: number;
  rationaleSignals: string[];
  cautionSignals: string[];
  classScores: Record<GmailIntelligenceClassType, number>;
};

type ClassifierInput = {
  subject: string;
  bodyText: string;
  snippet: string;
  matchedQueryKey?: string;
  vendorMatch: VendorMatchResult;
};

const WELCOME_PATTERNS = [
  /\bwelcome to\b/,
  /\bthanks for subscribing\b/,
  /\bplan is active\b/,
  /\bmembership confirmed\b/,
  /\btrial started\b/
];

const RENEWAL_PATTERNS = [
  /\brenews?\s+on\b/,
  /\brenewal reminder\b/,
  /\bauto[\s-]?renew(?:ing)?\b/,
  /\bnext billing date\b/,
  /\bmembership renews\b/
];

const SUBSCRIPTION_RECEIPT_PATTERNS = [
  /\bsubscription receipt\b/,
  /\bplan receipt\b/,
  /\bmembership receipt\b/,
  /\bsubscription invoice\b/,
  /\bcharged successfully\b/
];

const CANCELLATION_PATTERNS = [
  /\bsubscription has been cancel(?:ed|led)\b/,
  /\bmembership will end on\b/,
  /\bauto[\s-]?renew (?:is|turned)\s+off\b/,
  /\bcancellation confirmed\b/,
  /\bwill not renew\b/
];

const BILL_STATEMENT_PATTERNS = [
  /\bstatement\b/,
  /\bmonthly statement\b/,
  /\baccount summary\b/,
  /\bbill is ready\b/
];

const PAYMENT_DUE_PATTERNS = [
  /\bpayment due\b/,
  /\bminimum payment\b/,
  /\bamount due\b/,
  /\bdue date\b/
];

const GENERIC_RECEIPT_PATTERNS = [/\breceipt\b/, /\binvoice\b/, /\bpayment received\b/];

const SUBSCRIPTION_LANGUAGE_PATTERNS = [
  /\bsubscription\b/,
  /\bmembership\b/,
  /\bplan\b/,
  /\brecurring\b/,
  /\bbilled (?:monthly|annually|yearly|quarterly)\b/
];

const NEGATIVE_SUBSCRIPTION_PATTERNS = [
  /\bsecurity alert\b/,
  /\blogin code\b/,
  /\bverify your account\b/,
  /\border shipped\b/,
  /\bpackage delivered\b/
];

export function classifyGmailMessageV2(input: ClassifierInput): GmailClassifierV2Result {
  const text = normalize([input.subject, input.bodyText, input.snippet].join("\n"));
  const classScores: Record<GmailIntelligenceClassType, number> = {
    SUBSCRIPTION_WELCOME: 0.02,
    SUBSCRIPTION_RENEWAL: 0.02,
    SUBSCRIPTION_RECEIPT: 0.02,
    SUBSCRIPTION_CANCELLATION: 0.02,
    BILL_STATEMENT: 0.02,
    PAYMENT_DUE: 0.02,
    GENERIC_RECEIPT: 0.02,
    UNKNOWN: 0.02
  };
  const rationaleSignals: string[] = [];
  const cautionSignals: string[] = [];

  classScores.SUBSCRIPTION_WELCOME += countMatches(text, WELCOME_PATTERNS) * 0.46;
  classScores.SUBSCRIPTION_RENEWAL += countMatches(text, RENEWAL_PATTERNS) * 0.52;
  classScores.SUBSCRIPTION_RECEIPT += countMatches(text, SUBSCRIPTION_RECEIPT_PATTERNS) * 0.48;
  classScores.SUBSCRIPTION_CANCELLATION += countMatches(text, CANCELLATION_PATTERNS) * 0.58;
  classScores.BILL_STATEMENT += countMatches(text, BILL_STATEMENT_PATTERNS) * 0.45;
  classScores.PAYMENT_DUE += countMatches(text, PAYMENT_DUE_PATTERNS) * 0.5;
  classScores.GENERIC_RECEIPT += countMatches(text, GENERIC_RECEIPT_PATTERNS) * 0.35;

  const subscriptionLanguageCount = countMatches(text, SUBSCRIPTION_LANGUAGE_PATTERNS);
  const negativeLanguageCount = countMatches(text, NEGATIVE_SUBSCRIPTION_PATTERNS);
  const hasPrice = /\b(?:USD|EUR|GBP|CAD|AUD)\s*\d+|[$€£]\s*\d+/.test(text);

  if (subscriptionLanguageCount > 0) {
    classScores.SUBSCRIPTION_WELCOME += Math.min(0.25, subscriptionLanguageCount * 0.09);
    classScores.SUBSCRIPTION_RENEWAL += Math.min(0.28, subscriptionLanguageCount * 0.1);
    classScores.SUBSCRIPTION_RECEIPT += Math.min(0.26, subscriptionLanguageCount * 0.09);
    classScores.SUBSCRIPTION_CANCELLATION += Math.min(0.22, subscriptionLanguageCount * 0.08);
    rationaleSignals.push("subscription_language_detected");
  }

  if (hasPrice) {
    classScores.SUBSCRIPTION_RECEIPT += 0.12;
    classScores.GENERIC_RECEIPT += 0.08;
    classScores.PAYMENT_DUE += 0.06;
    rationaleSignals.push("price_detected");
  }

  applyVendorBias(classScores, input.vendorMatch.category, input.vendorMatch.outcome);
  applyQueryBias(classScores, input.matchedQueryKey);

  if (negativeLanguageCount > 0) {
    classScores.SUBSCRIPTION_WELCOME -= Math.min(0.22, negativeLanguageCount * 0.08);
    classScores.SUBSCRIPTION_RECEIPT -= Math.min(0.14, negativeLanguageCount * 0.06);
    cautionSignals.push("negative_subscription_language");
  }

  const ranked = (
    Object.entries(classScores) as Array<[GmailIntelligenceClassType, number]>
  ).sort((a, b) => b[1] - a[1]);

  const top = ranked[0] ?? ["UNKNOWN", 0];
  const second = ranked[1] ?? ["UNKNOWN", 0];
  const margin = Math.max(0, top[1] - second[1]);
  const classType =
    top[0] === "UNKNOWN" || top[1] < 0.34 ? "UNKNOWN" : (top[0] as GmailIntelligenceClassType);

  if (
    classType === "SUBSCRIPTION_WELCOME" &&
    subscriptionLanguageCount === 0 &&
    !hasPrice &&
    input.vendorMatch.category !== "SUBSCRIPTION" &&
    input.vendorMatch.category !== "SOFTWARE"
  ) {
    cautionSignals.push("welcome_without_subscription_support");
  }

  if (
    (input.vendorMatch.category === "BANK" || input.vendorMatch.category === "CREDIT_CARD") &&
    classType.startsWith("SUBSCRIPTION")
  ) {
    cautionSignals.push("financial_vendor_subscription_conflict");
  }

  const lifecycleEmailType = toLifecycleType(classType);
  const subscriptionLikelihood = clamp(
    0.08 +
      (classType.startsWith("SUBSCRIPTION") ? 0.35 : 0) +
      Math.min(0.35, subscriptionLanguageCount * 0.08) +
      (input.vendorMatch.category === "SUBSCRIPTION" || input.vendorMatch.category === "SOFTWARE"
        ? 0.18
        : 0) +
      (input.vendorMatch.outcome === "MATCHED" ? 0.08 : 0) -
      (cautionSignals.length > 0 ? 0.12 : 0),
    0,
    1
  );

  const classConfidence = clamp(
    0.16 +
      Math.min(0.48, top[1] * 0.42) +
      Math.min(0.22, margin * 0.32) +
      (input.vendorMatch.outcome === "MATCHED" ? 0.08 : 0) -
      (classType === "UNKNOWN" ? 0.2 : 0),
    0,
    1
  );

  rationaleSignals.push(`class:${classType.toLowerCase()}`);
  if (input.vendorMatch.vendorKey) {
    rationaleSignals.push(`vendor:${input.vendorMatch.vendorKey}`);
  }

  return {
    classType,
    lifecycleEmailType,
    subscriptionLikelihood,
    classConfidence,
    rationaleSignals: unique(rationaleSignals),
    cautionSignals: unique(cautionSignals),
    classScores
  };
}

function applyVendorBias(
  scores: Record<GmailIntelligenceClassType, number>,
  category: VendorCategory,
  outcome: VendorMatchResult["outcome"]
) {
  const matchedBoost = outcome === "MATCHED" ? 0.08 : 0.03;
  if (category === "SUBSCRIPTION" || category === "SOFTWARE") {
    scores.SUBSCRIPTION_WELCOME += 0.12 + matchedBoost;
    scores.SUBSCRIPTION_RENEWAL += 0.14 + matchedBoost;
    scores.SUBSCRIPTION_RECEIPT += 0.14 + matchedBoost;
    scores.SUBSCRIPTION_CANCELLATION += 0.12 + matchedBoost;
    scores.BILL_STATEMENT -= 0.05;
  } else if (category === "BANK" || category === "CREDIT_CARD" || category === "UTILITY") {
    scores.BILL_STATEMENT += 0.14 + matchedBoost;
    scores.PAYMENT_DUE += 0.16 + matchedBoost;
    scores.SUBSCRIPTION_WELCOME -= 0.15;
    scores.SUBSCRIPTION_RENEWAL -= 0.12;
    scores.SUBSCRIPTION_CANCELLATION -= 0.1;
  } else if (category === "TELECOM") {
    scores.BILL_STATEMENT += 0.1;
    scores.PAYMENT_DUE += 0.08;
    scores.SUBSCRIPTION_RECEIPT += 0.06;
  } else if (category === "RETAIL") {
    scores.GENERIC_RECEIPT += 0.08;
  }
}

function applyQueryBias(
  scores: Record<GmailIntelligenceClassType, number>,
  matchedQueryKey: string | undefined
) {
  if (!matchedQueryKey) return;
  if (matchedQueryKey === "subscription_welcome") {
    scores.SUBSCRIPTION_WELCOME += 0.1;
  } else if (matchedQueryKey === "subscription_renewal") {
    scores.SUBSCRIPTION_RENEWAL += 0.1;
  } else if (matchedQueryKey === "subscription_cancellation") {
    scores.SUBSCRIPTION_CANCELLATION += 0.12;
  } else if (matchedQueryKey === "billing_due") {
    scores.PAYMENT_DUE += 0.1;
    scores.BILL_STATEMENT += 0.06;
  } else if (matchedQueryKey === "recurring_receipt") {
    scores.SUBSCRIPTION_RECEIPT += 0.08;
    scores.GENERIC_RECEIPT += 0.06;
  }
}

function toLifecycleType(classType: GmailIntelligenceClassType): GmailSubscriptionLifecycleEmailType {
  if (classType === "SUBSCRIPTION_WELCOME") return "WELCOME";
  if (classType === "SUBSCRIPTION_RENEWAL") return "RENEWAL";
  if (classType === "SUBSCRIPTION_RECEIPT") return "RECEIPT";
  if (classType === "SUBSCRIPTION_CANCELLATION") return "CANCELLATION";
  return "UNKNOWN";
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countMatches(text: string, patterns: RegExp[]) {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) count += 1;
  }
  return count;
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
