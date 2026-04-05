import type { GmailSubscriptionLifecycleEmailType } from "./gmail-subscription-classifier";

export type GmailSubscriptionBillingPeriod = "MONTHLY" | "YEARLY" | "QUARTERLY" | "UNKNOWN";
export type GmailSubscriptionTrialStatus = "NONE" | "ACTIVE" | "EXPIRED" | "UNKNOWN";
export type GmailSubscriptionAutoRenewStatus = "ON" | "OFF" | "UNKNOWN";

export type GmailSubscriptionExtractionResult = {
  vendor: string | null;
  vendorKey: string | null;
  planName: string | null;
  subscriptionName: string | null;
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  introPrice: number | null;
  recurringPrice: number | null;
  amountCharged: number | null;
  currency: string | null;
  billingPeriod: GmailSubscriptionBillingPeriod;
  trialStatus: GmailSubscriptionTrialStatus;
  trialEndDate: string | null;
  renewalDate: string | null;
  receiptDate: string | null;
  cancellationEffectiveDate: string | null;
  autoRenewStatus: GmailSubscriptionAutoRenewStatus;
  sourceEmailSubject: string;
  sourceEmailDate: string | null;
  extractionSignals: string[];
};

type ExtractionInput = {
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  subject: string;
  from: string;
  bodyText: string;
  snippet: string;
  messageDate: string | null;
};

const CURRENCY_SYMBOL: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP"
};

export function extractGmailSubscriptionDetails(
  input: ExtractionInput
): GmailSubscriptionExtractionResult {
  const fullText = [input.subject, input.bodyText, input.snippet].filter(Boolean).join("\n");
  const normalized = normalize(fullText);
  const lower = normalized.toLowerCase();
  const extractionSignals: string[] = [];

  const vendor = extractVendorFromHeader(input.from) ?? extractVendorFromBody(normalized);
  const vendorKey = vendor ? normalizeKey(vendor) : null;
  if (vendor) extractionSignals.push("vendor_detected");

  const planName = extractPlanName(normalized);
  if (planName) extractionSignals.push("plan_detected");
  const subscriptionName = buildSubscriptionName(vendor, planName);

  const moneyMentions = collectMoneyMentions(normalized);
  const introPrice = selectPriceByContext(moneyMentions, /(trial|first|intro|starting)/i);
  const recurringPriceRegex = input.lifecycleEmailType === "WELCOME"
    ? /(monthly|annual|yearly|quarterly|every\s+(month|year|quarter)|auto[\s-]?renew|renews?|subscription|plan|membership)/i
    : /(monthly|annual|yearly|quarterly|every\s+(month|year|quarter)|auto[\s-]?renew|renews?)/i;

  const recurringPrice = selectPriceByContext(moneyMentions, recurringPriceRegex);
  const amountCharged = selectPriceByContext(
    moneyMentions,
    /(charged|receipt|invoice|payment(?:\s+received)?|you paid|paid)/i
  );

  const currency =
    (moneyMentions.find((item) => item.currency)?.currency ?? null) ||
    (recurringPrice ? inferCurrencyFromPrice(moneyMentions, recurringPrice) : null) ||
    (amountCharged ? inferCurrencyFromPrice(moneyMentions, amountCharged) : null);
  if (currency) extractionSignals.push("currency_detected");

  const billingPeriod = extractBillingPeriod(lower);
  if (billingPeriod !== "UNKNOWN") extractionSignals.push("billing_period_detected");

  const trialStatus = extractTrialStatus(lower);
  if (trialStatus !== "UNKNOWN" && trialStatus !== "NONE") extractionSignals.push("trial_detected");

  const trialKeywords = input.lifecycleEmailType === "WELCOME"
    ? ["trial ends", "trial end", "end of trial", "first charge on", "billing begins on", "free until"]
    : ["trial ends", "trial end", "end of trial"];
  const trialEndDate = findDateNearKeywords(normalized, trialKeywords);

  const renewalDate = findDateNearKeywords(normalized, [
    "renews on",
    "renewal on",
    "next billing date",
    "next charge",
    "auto-renewing on"
  ]);
  const receiptDate =
    findDateNearKeywords(normalized, ["receipt date", "charged on", "payment date"]) ??
    (input.lifecycleEmailType === "RECEIPT" ? input.messageDate : null);

  const cancellationKeywords = input.lifecycleEmailType === "CANCELLATION"
    ? ["ends on", "end date", "effective", "will expire on", "expires on", "canceled on", "cancelled on", "active until", "valid until"]
    : ["ends on", "end date", "effective", "will expire on", "expires on"];
  const cancellationEffectiveDate = findDateNearKeywords(normalized, cancellationKeywords);

  const autoRenewStatus = extractAutoRenewStatus(lower, input.lifecycleEmailType);
  if (autoRenewStatus !== "UNKNOWN") extractionSignals.push(`auto_renew_${autoRenewStatus.toLowerCase()}`);

  if (introPrice !== null) extractionSignals.push("intro_price_detected");
  if (recurringPrice !== null) extractionSignals.push("recurring_price_detected");
  if (amountCharged !== null) extractionSignals.push("charged_amount_detected");
  if (renewalDate) extractionSignals.push("renewal_date_detected");
  if (cancellationEffectiveDate) extractionSignals.push("cancellation_date_detected");

  return {
    vendor,
    vendorKey,
    planName,
    subscriptionName,
    lifecycleEmailType: input.lifecycleEmailType,
    introPrice,
    recurringPrice,
    amountCharged,
    currency,
    billingPeriod,
    trialStatus,
    trialEndDate,
    renewalDate,
    receiptDate,
    cancellationEffectiveDate,
    autoRenewStatus,
    sourceEmailSubject: sanitize(input.subject, 280),
    sourceEmailDate: input.messageDate,
    extractionSignals: Array.from(new Set(extractionSignals))
  };
}

type MoneyMention = {
  amount: number;
  currency: string | null;
  index: number;
  context: string;
};

function collectMoneyMentions(text: string): MoneyMention[] {
  const mentions: MoneyMention[] = [];
  const pattern = /\b(USD|EUR|GBP|CAD|AUD)\s*([0-9]+(?:\.[0-9]{1,2})?)|([$€£])\s*([0-9]+(?:\.[0-9]{1,2})?)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const code = match[1] ? match[1].toUpperCase() : null;
    const symbol = match[3] ?? null;
    const amountRaw = match[2] ?? match[4] ?? "";
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) continue;
    const index = match.index;
    const context = text.slice(Math.max(0, index - 50), Math.min(text.length, index + 80));

    mentions.push({
      amount,
      currency: code ?? (symbol ? CURRENCY_SYMBOL[symbol] ?? null : null),
      index,
      context
    });
  }

  return mentions;
}

function selectPriceByContext(mentions: MoneyMention[], pattern: RegExp) {
  const matched = mentions.find((item) => pattern.test(item.context));
  if (matched) return matched.amount;
  return null;
}

function inferCurrencyFromPrice(mentions: MoneyMention[], amount: number) {
  const match = mentions.find((item) => item.amount === amount && item.currency);
  return match?.currency ?? null;
}

function extractBillingPeriod(text: string): GmailSubscriptionBillingPeriod {
  if (/\bmonthly\b|\bevery month\b|\/month\b/.test(text)) return "MONTHLY";
  if (/\bannual(?:ly)?\b|\byearly\b|\bevery year\b|\/year\b/.test(text)) return "YEARLY";
  if (/\bquarterly\b|\bevery quarter\b|\/quarter\b/.test(text)) return "QUARTERLY";
  return "UNKNOWN";
}

function extractTrialStatus(text: string): GmailSubscriptionTrialStatus {
  if (/\btrial ended\b|\btrial expired\b/.test(text)) return "EXPIRED";
  if (/\btrial started\b|\bfree trial\b|\btrial is active\b/.test(text)) return "ACTIVE";
  if (/\bno trial\b/.test(text)) return "NONE";
  if (/\btrial\b/.test(text)) return "UNKNOWN";
  return "NONE";
}

function extractAutoRenewStatus(
  text: string,
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType
): GmailSubscriptionAutoRenewStatus {
  if (
    /\bauto[\s-]?renew (?:is|turned)\s+off\b|\bwill not renew\b|\bnon[- ]renewing\b|\bcancel(?:led|ed)?\b/.test(
      text
    )
  ) {
    return "OFF";
  }
  if (/\bauto[\s-]?renew(?:ing)?\b|\brenews automatically\b|\bauto[\s-]?renew is on\b/.test(text)) {
    return "ON";
  }
  if (lifecycleEmailType === "CANCELLATION") return "OFF";
  return "UNKNOWN";
}

function findDateNearKeywords(text: string, keywords: string[]) {
  const lowered = text.toLowerCase();
  for (const keyword of keywords) {
    const idx = lowered.indexOf(keyword.toLowerCase());
    if (idx < 0) continue;
    const slice = text.slice(Math.max(0, idx - 16), Math.min(text.length, idx + 90));
    const parsed = parseDateFromText(slice);
    if (parsed) return parsed;
  }
  return null;
}

function parseDateFromText(text: string) {
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const parsed = safeDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (parsed) return parsed.toISOString();
  }

  const mdY = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    const year = mdY[3] ? expandYear(Number(mdY[3])) : new Date().getUTCFullYear();
    const parsed = safeDate(year, month - 1, day);
    if (parsed) return parsed.toISOString();
  }

  const monthName =
    text.match(
      /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/i
    ) ?? null;
  if (monthName) {
    const monthIndex = monthIndexFromName(monthName[1]);
    const day = Number(monthName[2]);
    const year = monthName[3] ? Number(monthName[3]) : new Date().getUTCFullYear();
    const parsed = safeDate(year, monthIndex, day);
    if (parsed) return parsed.toISOString();
  }

  return null;
}

function monthIndexFromName(name: string) {
  const normalized = name.toLowerCase();
  const keys = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec"
  ];
  const key = normalized.slice(0, 3);
  const index = keys.indexOf(key);
  return index >= 0 ? index : 0;
}

function safeDate(year: number, monthIndex: number, day: number) {
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) return null;
  const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function expandYear(year: number) {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function extractVendorFromHeader(rawFrom: string) {
  const compact = (rawFrom || "").trim();
  if (!compact) return null;

  const displayNameMatch = compact.match(/^([^<]+)</);
  if (displayNameMatch?.[1]) {
    const display = cleanLabel(displayNameMatch[1]);
    if (display && !/^no[- ]?reply$/i.test(display)) return display;
  }

  const emailMatch = compact.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (!emailMatch?.[1]) return null;
  const root = emailMatch[1].split(".")[0]?.toLowerCase() ?? "";
  if (!root || ["gmail", "outlook", "hotmail", "yahoo"].includes(root)) return null;
  return toTitleCase(root.replace(/[-_]+/g, " "));
}

function extractVendorFromBody(text: string) {
  const match = text.match(
    /\b(?:from|for|with)\s+([A-Za-z][A-Za-z0-9&' .-]{2,40})\s+(?:subscription|membership|plan)\b/i
  );
  if (!match?.[1]) return null;
  return cleanLabel(match[1]);
}

function extractPlanName(text: string) {
  const matchers = [
    /\b(?:your|the)?\s*([A-Za-z0-9][A-Za-z0-9&' .-]{1,40})\s+(?:plan|membership|subscription)\b/i,
    /\bplan[:\s]+([A-Za-z0-9][A-Za-z0-9&' .-]{1,45})\b/i,
    /\bmembership[:\s]+([A-Za-z0-9][A-Za-z0-9&' .-]{1,45})\b/i
  ];

  for (const matcher of matchers) {
    const hit = text.match(matcher);
    if (!hit?.[1]) continue;
    const cleaned = cleanLabel(hit[1]);
    if (cleaned) return cleaned;
  }

  return null;
}

function buildSubscriptionName(vendor: string | null, planName: string | null) {
  if (vendor && planName) return `${vendor} ${planName}`;
  if (vendor) return `${vendor} Subscription`;
  return planName;
}

function normalize(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
}

function sanitize(value: string, maxLength: number) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[ \t\n]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanLabel(value: string) {
  const cleaned = sanitize(value, 60);
  if (!cleaned) return null;
  return cleaned;
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}
