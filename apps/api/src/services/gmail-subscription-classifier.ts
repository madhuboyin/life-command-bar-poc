export type GmailSubscriptionLifecycleEmailType =
  | "WELCOME"
  | "RENEWAL"
  | "RECEIPT"
  | "CANCELLATION"
  | "UNKNOWN";

export type GmailSubscriptionClassificationResult = {
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  subscriptionLikelihood: number;
  classConfidence: number;
  rationaleSignals: string[];
  cautionSignals: string[];
  classScores: Record<GmailSubscriptionLifecycleEmailType, number>;
};

type ClassificationInput = {
  subject: string;
  from: string;
  bodyText: string;
  snippet: string;
  matchedQueryKey?: string;
};

const SUBSCRIPTION_EVIDENCE_PATTERNS = [
  /\bsubscription\b/,
  /\bmembership\b/,
  /\bplan\b/,
  /\bauto[\s-]?renew\b/,
  /\bbilled\s+(monthly|annually|yearly|quarterly)\b/,
  /\brecurring\b/,
  /\btrial\b/,
  /\bpremium\b/
];

const WELCOME_PATTERNS = [
  /\bwelcome to\b/,
  /\bthanks for subscribing\b/,
  /\byour (?:plan|membership|subscription) is active\b/,
  /\bmembership confirmed\b/,
  /\btrial started\b/,
  /\byou(?:'| a)?re all set\b/
];

const RENEWAL_PATTERNS = [
  /\brenews?\s+on\b/,
  /\brenewal reminder\b/,
  /\bauto[\s-]?renew(?:ing)?\b/,
  /\bnext billing date\b/,
  /\bmembership renews\b/,
  /\brenews soon\b/,
  /\bupcoming renewal\b/
];

const RECEIPT_PATTERNS = [
  /\breceipt\b/,
  /\binvoice\b/,
  /\bpayment received\b/,
  /\bcharged\b/,
  /\bstatement\b/,
  /\bthanks for your payment\b/,
  /\bsuccessful payment\b/
];

const CANCELLATION_PATTERNS = [
  /\bsubscription has been canceled\b/,
  /\bsubscription has been cancelled\b/,
  /\bmembership (?:will )?end(?:s)? on\b/,
  /\bauto[\s-]?renew (?:is|turned)\s+off\b/,
  /\bcancellation confirmed\b/,
  /\bsorry to see you go\b/,
  /\bplan expires?\b/,
  /\bwill not renew\b/
];

const NON_SUBSCRIPTION_WELCOME_PATTERNS = [
  /\bverify your email\b/,
  /\bconfirm your account\b/,
  /\bpassword reset\b/,
  /\bsecurity alert\b/,
  /\blogin\b/,
  /\bnew sign[- ]?in\b/
];

export function classifyGmailSubscriptionLifecycle(
  input: ClassificationInput
): GmailSubscriptionClassificationResult {
  const text = normalize([input.subject, input.bodyText, input.snippet, input.from].join("\n"));
  const hasPrice = /\b(?:usd|eur|gbp|cad|aud)\s*\d+|[$€£]\s*\d+/.test(text);
  const subscriptionEvidenceCount = countMatches(text, SUBSCRIPTION_EVIDENCE_PATTERNS);
  const cautionSignals: string[] = [];

  if (countMatches(text, NON_SUBSCRIPTION_WELCOME_PATTERNS) > 0) {
    cautionSignals.push("generic_account_welcome_signal");
  }

  const scores: Record<GmailSubscriptionLifecycleEmailType, number> = {
    WELCOME: 0.03,
    RENEWAL: 0.03,
    RECEIPT: 0.03,
    CANCELLATION: 0.03,
    UNKNOWN: 0.03
  };

  scores.WELCOME += countMatches(text, WELCOME_PATTERNS) * 0.46;
  scores.RENEWAL += countMatches(text, RENEWAL_PATTERNS) * 0.52;
  scores.RECEIPT += countMatches(text, RECEIPT_PATTERNS) * 0.48;
  scores.CANCELLATION += countMatches(text, CANCELLATION_PATTERNS) * 0.58;

  if (subscriptionEvidenceCount > 0) {
    scores.WELCOME += Math.min(0.42, subscriptionEvidenceCount * 0.12);
    scores.RENEWAL += Math.min(0.35, subscriptionEvidenceCount * 0.1);
    scores.RECEIPT += Math.min(0.35, subscriptionEvidenceCount * 0.1);
    scores.CANCELLATION += Math.min(0.3, subscriptionEvidenceCount * 0.08);
  }

  if (hasPrice) {
    scores.RECEIPT += 0.2;
    scores.RENEWAL += 0.08;
    scores.WELCOME += 0.06;
  }

  if (input.matchedQueryKey === "subscription_renewal") {
    scores.RENEWAL += 0.08;
  }
  if (input.matchedQueryKey === "billing_due" || input.matchedQueryKey === "recurring_receipt") {
    scores.RECEIPT += 0.08;
  }
  if (input.matchedQueryKey === "subscription_welcome") {
    scores.WELCOME += 0.08;
  }
  if (input.matchedQueryKey === "subscription_cancellation") {
    scores.CANCELLATION += 0.1;
  }

  const ranked = (
    Object.entries(scores) as Array<[GmailSubscriptionLifecycleEmailType, number]>
  ).sort((a, b) => b[1] - a[1]);

  let winner = ranked[0]?.[0] ?? "UNKNOWN";
  const topScore = ranked[0]?.[1] ?? 0;
  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = topScore - secondScore;

  if (winner === "WELCOME") {
    const welcomeHits = countMatches(text, WELCOME_PATTERNS);
    const hasSupportingEvidence =
      subscriptionEvidenceCount > 0 || hasPrice || /\btrial\b|\bmonthly\b|\bannual(?:ly)?\b/.test(text);
    if (welcomeHits > 0 && !hasSupportingEvidence) {
      winner = "UNKNOWN";
      cautionSignals.push("welcome_without_subscription_evidence");
    }
  }

  const subscriptionLikelihood = clamp(
    0.12 +
      Math.min(0.62, topScore * 0.24) +
      Math.min(0.2, subscriptionEvidenceCount * 0.06) +
      (hasPrice ? 0.05 : 0) -
      (cautionSignals.length > 0 ? 0.08 : 0),
    0,
    1
  );

  const classConfidence = clamp(
    0.2 +
      Math.min(0.55, topScore * 0.22) +
      Math.min(0.2, margin * 0.25) +
      (subscriptionEvidenceCount > 1 ? 0.05 : 0) -
      (winner === "UNKNOWN" ? 0.18 : 0),
    0,
    1
  );

  const rationaleSignals = buildRationaleSignals({
    text,
    lifecycleEmailType: winner,
    hasPrice,
    subscriptionEvidenceCount
  });

  return {
    lifecycleEmailType: winner,
    subscriptionLikelihood,
    classConfidence,
    rationaleSignals,
    cautionSignals,
    classScores: scores
  };
}

function buildRationaleSignals(input: {
  text: string;
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  hasPrice: boolean;
  subscriptionEvidenceCount: number;
}) {
  const signals: string[] = [];
  signals.push(`lifecycle:${input.lifecycleEmailType.toLowerCase()}`);
  if (input.hasPrice) signals.push("price_detected");
  if (input.subscriptionEvidenceCount > 0) signals.push("subscription_language_detected");
  if (/\btrial\b/.test(input.text)) signals.push("trial_language_detected");
  if (/\bmonthly\b|\bannual(?:ly)?\b|\byearly\b|\bquarterly\b/.test(input.text)) {
    signals.push("billing_period_language_detected");
  }
  return signals;
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
