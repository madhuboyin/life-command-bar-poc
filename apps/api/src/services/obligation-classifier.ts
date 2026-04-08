import type {
  ObligationIntelligenceCategory,
  ObligationIntelligenceClassified,
  ObligationIntelligenceConfidenceBand
} from "./obligation-intelligence.types";
import type { VendorCategory } from "./vendor-profiles";

type ClassifierInput = {
  normalizedText: string;
  titleHint?: string | null;
  matchedQueryKey?: string | null;
  vendorCategory?: VendorCategory | null;
  lifecycleEmailType?: string | null;
  baseTypeHint?: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
};

const CATEGORY_LIST: ObligationIntelligenceCategory[] = [
  "SUBSCRIPTION",
  "BILL",
  "STATEMENT",
  "PAYMENT_DUE",
  "UTILITY",
  "TELECOM",
  "INSURANCE",
  "CREDIT_CARD",
  "LOAN",
  "SERVICE_RENEWAL",
  "COMPLIANCE",
  "COMMITMENT",
  "UNKNOWN"
];

const CATEGORY_KEYWORDS: Record<
  Exclude<ObligationIntelligenceCategory, "UNKNOWN">,
  Array<{ phrase: RegExp; weight: number; signal: string }>
> = {
  SUBSCRIPTION: [
    { phrase: /\bsubscription\b/, weight: 1.6, signal: "keyword:subscription" },
    { phrase: /\bmembership\b/, weight: 1.35, signal: "keyword:membership" },
    { phrase: /\bmonthly plan\b/, weight: 1.3, signal: "keyword:monthly_plan" },
    { phrase: /\bcancel anytime\b/, weight: 0.7, signal: "keyword:cancel_anytime" }
  ],
  BILL: [
    { phrase: /\bbill(?:ing)?\b/, weight: 1.35, signal: "keyword:bill" },
    { phrase: /\bamount due\b/, weight: 1.45, signal: "keyword:amount_due" },
    { phrase: /\bbalance due\b/, weight: 1.35, signal: "keyword:balance_due" },
    { phrase: /\binvoice\b/, weight: 1.3, signal: "keyword:invoice" }
  ],
  STATEMENT: [
    { phrase: /\bstatement\b/, weight: 1.45, signal: "keyword:statement" },
    { phrase: /\bstatement ready\b/, weight: 1.5, signal: "keyword:statement_ready" },
    { phrase: /\baccount summary\b/, weight: 1.2, signal: "keyword:account_summary" }
  ],
  PAYMENT_DUE: [
    { phrase: /\bpayment due\b/, weight: 1.7, signal: "keyword:payment_due" },
    { phrase: /\bdue date\b/, weight: 1.3, signal: "keyword:due_date" },
    { phrase: /\bminimum payment\b/, weight: 1.5, signal: "keyword:minimum_payment" },
    { phrase: /\bpay by\b/, weight: 1.2, signal: "keyword:pay_by" }
  ],
  UTILITY: [
    { phrase: /\butility\b/, weight: 1.5, signal: "keyword:utility" },
    { phrase: /\belectric(?:ity)? bill\b/, weight: 1.5, signal: "keyword:electric_bill" },
    { phrase: /\bwater bill\b/, weight: 1.4, signal: "keyword:water_bill" },
    { phrase: /\bgas bill\b/, weight: 1.4, signal: "keyword:gas_bill" }
  ],
  TELECOM: [
    { phrase: /\bphone bill\b/, weight: 1.45, signal: "keyword:phone_bill" },
    { phrase: /\bwireless\b/, weight: 1.2, signal: "keyword:wireless" },
    { phrase: /\binternet service\b/, weight: 1.25, signal: "keyword:internet_service" },
    { phrase: /\bmobile plan\b/, weight: 1.3, signal: "keyword:mobile_plan" }
  ],
  INSURANCE: [
    { phrase: /\binsurance\b/, weight: 1.55, signal: "keyword:insurance" },
    { phrase: /\bpolicy\b/, weight: 1.1, signal: "keyword:policy" },
    { phrase: /\bpremium due\b/, weight: 1.45, signal: "keyword:premium_due" },
    { phrase: /\bcoverage\b/, weight: 0.85, signal: "keyword:coverage" }
  ],
  CREDIT_CARD: [
    { phrase: /\bcredit card\b/, weight: 1.5, signal: "keyword:credit_card" },
    { phrase: /\bminimum payment\b/, weight: 1.55, signal: "keyword:minimum_payment" },
    { phrase: /\bstatement balance\b/, weight: 1.35, signal: "keyword:statement_balance" },
    { phrase: /\bcard ending\b/, weight: 1.1, signal: "keyword:card_ending" }
  ],
  LOAN: [
    { phrase: /\bloan payment\b/, weight: 1.55, signal: "keyword:loan_payment" },
    { phrase: /\bmortgage\b/, weight: 1.35, signal: "keyword:mortgage" },
    { phrase: /\binstallment\b/, weight: 1.15, signal: "keyword:installment" },
    { phrase: /\bprincipal\b/, weight: 0.9, signal: "keyword:principal" }
  ],
  SERVICE_RENEWAL: [
    { phrase: /\brenew(?:al|s?)\b/, weight: 1.55, signal: "keyword:renewal" },
    { phrase: /\bexpires?\b/, weight: 1.3, signal: "keyword:expires" },
    { phrase: /\bauto[\s-]?renew\b/, weight: 1.3, signal: "keyword:auto_renew" },
    { phrase: /\bservice renewal\b/, weight: 1.5, signal: "keyword:service_renewal" }
  ],
  COMPLIANCE: [
    { phrase: /\brequired action\b/, weight: 1.4, signal: "keyword:required_action" },
    { phrase: /\bverify identity\b/, weight: 1.1, signal: "keyword:verify_identity" },
    { phrase: /\bdeadline\b/, weight: 1.05, signal: "keyword:deadline" },
    { phrase: /\bmust submit\b/, weight: 1.2, signal: "keyword:must_submit" }
  ],
  COMMITMENT: [
    { phrase: /\bfollow up\b/, weight: 1.1, signal: "keyword:follow_up" },
    { phrase: /\bremember to\b/, weight: 1.05, signal: "keyword:remember_to" },
    { phrase: /\bcomplete by\b/, weight: 1.15, signal: "keyword:complete_by" },
    { phrase: /\bappointment\b/, weight: 0.9, signal: "keyword:appointment" }
  ]
};

export function classifyObligationCategory(input: ClassifierInput): ObligationIntelligenceClassified {
  const text = `${input.titleHint ?? ""}\n${input.normalizedText}`.toLowerCase();
  const scores = Object.fromEntries(CATEGORY_LIST.map((key) => [key, 0.02])) as Record<
    ObligationIntelligenceCategory,
    number
  >;
  const rationaleSignals: string[] = [];
  const cautionSignals: string[] = [];

  for (const [category, patterns] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [Exclude<ObligationIntelligenceCategory, "UNKNOWN">, typeof CATEGORY_KEYWORDS.SUBSCRIPTION]
  >) {
    for (const pattern of patterns) {
      if (pattern.phrase.test(text)) {
        scores[category] += pattern.weight;
        rationaleSignals.push(pattern.signal);
      }
    }
  }

  applyVendorBias(scores, input.vendorCategory, rationaleSignals);
  applyQueryBias(scores, input.matchedQueryKey, rationaleSignals);
  applyLifecycleBias(scores, input.lifecycleEmailType, rationaleSignals);
  applyBaseTypeBias(scores, input.baseTypeHint, rationaleSignals);

  if (/\bpayment received\b/.test(text) && !/\bamount due|payment due|due date|minimum payment\b/.test(text)) {
    scores.PAYMENT_DUE -= 0.4;
    cautionSignals.push("payment_received_without_due_signal");
  }

  if (/\b(one[-\s]?time|single purchase)\b/.test(text) && !/\bsubscription|renew|recurring\b/.test(text)) {
    scores.SUBSCRIPTION -= 0.45;
    cautionSignals.push("one_time_purchase_signal");
  }

  if (!/\b(due|renew|statement|bill|payment|policy|utility|loan|card|subscription)\b/.test(text)) {
    scores.UNKNOWN += 0.75;
    cautionSignals.push("weak_obligation_language");
  }

  const ranked = (Object.entries(scores) as Array<[ObligationIntelligenceCategory, number]>).sort(
    (a, b) => b[1] - a[1]
  );
  const winner = ranked[0]?.[0] ?? "UNKNOWN";
  const topScore = ranked[0]?.[1] ?? 0;
  const secondScore = ranked[1]?.[1] ?? 0;
  const total = ranked.reduce((sum, [, score]) => sum + score, 0);

  const confidenceScore = computeConfidence(topScore, secondScore, total, winner);
  const confidenceBand = toBand(confidenceScore);

  return {
    obligationCategory: confidenceScore < 0.34 ? "UNKNOWN" : winner,
    confidenceScore,
    confidenceBand,
    rationaleSignals: unique(rationaleSignals),
    cautionSignals: unique(cautionSignals),
    scores
  };
}

function applyVendorBias(
  scores: Record<ObligationIntelligenceCategory, number>,
  vendorCategory: VendorCategory | null | undefined,
  rationaleSignals: string[]
) {
  if (!vendorCategory || vendorCategory === "UNKNOWN") return;

  if (vendorCategory === "SUBSCRIPTION" || vendorCategory === "SOFTWARE") {
    scores.SUBSCRIPTION += 0.35;
    scores.SERVICE_RENEWAL += 0.18;
    rationaleSignals.push("vendor_bias:subscription");
    return;
  }

  if (vendorCategory === "UTILITY") {
    scores.UTILITY += 0.42;
    scores.BILL += 0.2;
    scores.PAYMENT_DUE += 0.16;
    rationaleSignals.push("vendor_bias:utility");
    return;
  }

  if (vendorCategory === "TELECOM") {
    scores.TELECOM += 0.42;
    scores.BILL += 0.2;
    scores.PAYMENT_DUE += 0.16;
    rationaleSignals.push("vendor_bias:telecom");
    return;
  }

  if (vendorCategory === "BANK") {
    scores.STATEMENT += 0.3;
    scores.PAYMENT_DUE += 0.27;
    scores.BILL += 0.16;
    rationaleSignals.push("vendor_bias:bank");
    return;
  }

  if (vendorCategory === "CREDIT_CARD") {
    scores.CREDIT_CARD += 0.44;
    scores.STATEMENT += 0.24;
    scores.PAYMENT_DUE += 0.26;
    rationaleSignals.push("vendor_bias:credit_card");
  }
}

function applyQueryBias(
  scores: Record<ObligationIntelligenceCategory, number>,
  matchedQueryKey: string | null | undefined,
  rationaleSignals: string[]
) {
  if (!matchedQueryKey) return;
  if (matchedQueryKey === "billing_due") {
    scores.PAYMENT_DUE += 0.24;
    scores.BILL += 0.16;
    rationaleSignals.push("query_bias:billing_due");
  } else if (matchedQueryKey === "subscription_renewal") {
    scores.SERVICE_RENEWAL += 0.22;
    scores.SUBSCRIPTION += 0.14;
    rationaleSignals.push("query_bias:subscription_renewal");
  } else if (matchedQueryKey === "subscription_welcome") {
    scores.SUBSCRIPTION += 0.24;
    rationaleSignals.push("query_bias:subscription_welcome");
  } else if (matchedQueryKey === "recurring_receipt") {
    scores.SUBSCRIPTION += 0.17;
    scores.BILL += 0.08;
    rationaleSignals.push("query_bias:recurring_receipt");
  }
}

function applyLifecycleBias(
  scores: Record<ObligationIntelligenceCategory, number>,
  lifecycleEmailType: string | null | undefined,
  rationaleSignals: string[]
) {
  if (!lifecycleEmailType) return;
  if (lifecycleEmailType === "WELCOME" || lifecycleEmailType === "RECEIPT") {
    scores.SUBSCRIPTION += 0.28;
    rationaleSignals.push(`lifecycle_bias:${lifecycleEmailType.toLowerCase()}`);
  } else if (lifecycleEmailType === "RENEWAL") {
    scores.SERVICE_RENEWAL += 0.33;
    scores.SUBSCRIPTION += 0.14;
    rationaleSignals.push("lifecycle_bias:renewal");
  } else if (lifecycleEmailType === "CANCELLATION") {
    scores.SERVICE_RENEWAL += 0.21;
    scores.SUBSCRIPTION += 0.13;
    rationaleSignals.push("lifecycle_bias:cancellation");
  }
}

function applyBaseTypeBias(
  scores: Record<ObligationIntelligenceCategory, number>,
  baseTypeHint: ClassifierInput["baseTypeHint"],
  rationaleSignals: string[]
) {
  if (!baseTypeHint) return;
  if (baseTypeHint === "BILL") {
    scores.BILL += 0.18;
    scores.PAYMENT_DUE += 0.14;
    rationaleSignals.push("base_type:bills");
  } else if (baseTypeHint === "SUBSCRIPTION") {
    scores.SUBSCRIPTION += 0.2;
    rationaleSignals.push("base_type:subscription");
  } else if (baseTypeHint === "RENEWAL") {
    scores.SERVICE_RENEWAL += 0.22;
    rationaleSignals.push("base_type:renewal");
  } else if (baseTypeHint === "COMMITMENT") {
    scores.COMMITMENT += 0.2;
    scores.COMPLIANCE += 0.1;
    rationaleSignals.push("base_type:commitment");
  }
}

function computeConfidence(
  topScore: number,
  secondScore: number,
  total: number,
  winner: ObligationIntelligenceCategory
) {
  const dominance = total > 0 ? topScore / total : 0;
  const margin = Math.max(0, topScore - secondScore);
  let value = 0.2 + dominance * 0.45 + Math.min(0.3, margin * 0.12);
  if (winner === "UNKNOWN") {
    value -= 0.12;
  }
  return clamp(value, 0.16, 0.98);
}

function toBand(score: number): ObligationIntelligenceConfidenceBand {
  if (score >= 0.78) return "HIGH";
  if (score >= 0.48) return "MEDIUM";
  return "LOW";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

