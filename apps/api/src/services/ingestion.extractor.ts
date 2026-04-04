import { SupportedObligationType } from "./ingestion.classifier";
import { IngestionChannel } from "./ingestion-normalizers";

export type ExtractedFields = {
  type: SupportedObligationType;
  title: string | null;
  description: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  recurrence: string | null;
  fieldConfidence: {
    title: number;
    vendor: number;
    amount: number;
    dueDate: number;
    recurrence: number;
  };
};

type ExtractionInput = {
  channel: IngestionChannel;
  classificationType: SupportedObligationType;
  rawText: string;
  normalizedText: string;
  titleHint?: string | null;
  metadata: Record<string, unknown>;
  now: Date;
};

const currencySymbolMap: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP"
};

const weekdayMap: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const monthMap: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
};

const stopVendorWords = new Set([
  "your",
  "the",
  "a",
  "an",
  "my",
  "auto",
  "payment",
  "due",
  "monthly",
  "renewal",
  "bill",
  "subscription",
  "statement",
  "invoice",
  "plan",
  "policy",
  "next",
  "week",
  "today",
  "tomorrow",
  "remind",
  "me"
]);

export function extractStructuredFields(input: ExtractionInput): ExtractedFields {
  const amount = extractAmountAndCurrency(input.rawText);
  const dueDate = parseDueDate(input.rawText, input.now);
  const recurrence = extractRecurrence(input.normalizedText, input.classificationType);
  const vendor = extractVendor({
    rawText: input.rawText,
    normalizedText: input.normalizedText,
    channel: input.channel,
    metadata: input.metadata
  });

  const title = buildTitle({
    titleHint: input.titleHint,
    vendor,
    type: input.classificationType,
    rawText: input.rawText
  });

  const description = buildDescription(input.rawText, title);

  return {
    type: input.classificationType,
    title,
    description,
    vendor: vendor.value,
    amount: amount.value,
    currency: amount.currency,
    dueDate: dueDate.iso,
    recurrence: recurrence.value,
    fieldConfidence: {
      title: title ? (input.titleHint ? 0.88 : vendor.value ? 0.82 : 0.65) : 0,
      vendor: vendor.value ? vendor.confidence : 0,
      amount: amount.confidence,
      dueDate: dueDate.confidence,
      recurrence: recurrence.confidence
    }
  };
}

function extractAmountAndCurrency(rawText: string): {
  value: number | null;
  currency: string | null;
  confidence: number;
} {
  const currencyFirstPattern = /\b(USD|EUR|GBP|CAD|AUD)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b/i;
  const symbolPattern = /([$€£])\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/;
  const amountDuePattern = /\b(?:amount\s+due|balance\s+due|payment\s+due|invoice\s+amount|bill(?:ed)?\s+amount)\b[^0-9]{0,10}([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;

  const currencyFirstMatch = rawText.match(currencyFirstPattern);
  if (currencyFirstMatch) {
    return {
      value: parseAmountNumber(currencyFirstMatch[2]),
      currency: currencyFirstMatch[1].toUpperCase(),
      confidence: 0.94
    };
  }

  const symbolMatch = rawText.match(symbolPattern);
  if (symbolMatch) {
    return {
      value: parseAmountNumber(symbolMatch[2]),
      currency: currencySymbolMap[symbolMatch[1]] ?? null,
      confidence: 0.92
    };
  }

  const amountDueMatch = rawText.match(amountDuePattern);
  if (amountDueMatch) {
    return {
      value: parseAmountNumber(amountDueMatch[1]),
      currency: null,
      confidence: 0.64
    };
  }

  return {
    value: null,
    currency: null,
    confidence: 0
  };
}

function parseAmountNumber(raw: string) {
  return Number(raw.replace(/,/g, ""));
}

function parseDueDate(rawText: string, now: Date): {
  iso: string | null;
  confidence: number;
} {
  const text = rawText.toLowerCase();

  if (/\btomorrow\b/.test(text)) {
    return {
      iso: addDaysAtNoon(now, 1).toISOString(),
      confidence: 0.9
    };
  }

  if (/\btoday\b/.test(text)) {
    return {
      iso: atNoon(now).toISOString(),
      confidence: 0.92
    };
  }

  const inDaysMatch = text.match(/\b(?:due\s+in|in)\s+(\d{1,3})\s+days\b/);
  if (inDaysMatch) {
    const offset = Number(inDaysMatch[1]);
    if (Number.isFinite(offset) && offset > 0) {
      return {
        iso: addDaysAtNoon(now, offset).toISOString(),
        confidence: 0.78
      };
    }
  }

  const isoMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const parsed = safeDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );
    if (parsed) {
      return {
        iso: parsed.toISOString(),
        confidence: 0.95
      };
    }
  }

  const slashMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = slashMatch[3]
      ? expandYear(Number(slashMatch[3]))
      : inferYearForMonthDay(now, month, day);

    const parsed = safeDate(year, month - 1, day);
    if (parsed) {
      return {
        iso: parsed.toISOString(),
        confidence: slashMatch[3] ? 0.9 : 0.76
      };
    }
  }

  const monthNameRegex = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i;
  const monthNameMatch = rawText.match(monthNameRegex);
  if (monthNameMatch) {
    const monthLabel = monthNameMatch[1].toLowerCase();
    const monthIndex = monthMap[monthLabel];
    const day = Number(monthNameMatch[2]);
    const year = monthNameMatch[3]
      ? Number(monthNameMatch[3])
      : inferYearForMonthDay(now, monthIndex + 1, day);

    const parsed = safeDate(year, monthIndex, day);
    if (parsed) {
      return {
        iso: parsed.toISOString(),
        confidence: monthNameMatch[3] ? 0.91 : 0.8
      };
    }
  }

  if (/\bnext\s+week\b/.test(text)) {
    return {
      iso: addDaysAtNoon(now, 7).toISOString(),
      confidence: 0.68
    };
  }

  const weekdayMatch = text.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const isNext = Boolean(weekdayMatch[1]);
    const targetDay = weekdayMap[weekdayMatch[2]];
    const parsed = nextWeekdayAtNoon(now, targetDay, isNext);

    return {
      iso: parsed.toISOString(),
      confidence: isNext ? 0.75 : 0.7
    };
  }

  return {
    iso: null,
    confidence: 0
  };
}

function extractRecurrence(
  normalizedText: string,
  classificationType: SupportedObligationType
): { value: string | null; confidence: number } {
  if (/\b(?:renews\s+)?monthly\b|\bevery\s+month\b/.test(normalizedText)) {
    return { value: "monthly", confidence: 0.92 };
  }

  if (/\b(?:renews\s+)?weekly\b|\bevery\s+week\b/.test(normalizedText)) {
    return { value: "weekly", confidence: 0.88 };
  }

  if (/\b(?:renews\s+)?quarterly\b|\bevery\s+quarter\b/.test(normalizedText)) {
    return { value: "quarterly", confidence: 0.9 };
  }

  if (/\bannual\b|\byearly\b|\bevery\s+year\b/.test(normalizedText)) {
    return { value: "yearly", confidence: 0.92 };
  }

  if (classificationType === "SUBSCRIPTION" && /\bplan\b/.test(normalizedText)) {
    return { value: "monthly", confidence: 0.52 };
  }

  return { value: null, confidence: 0 };
}

function extractVendor(input: {
  rawText: string;
  normalizedText: string;
  channel: IngestionChannel;
  metadata: Record<string, unknown>;
}): { value: string | null; confidence: number } {
  if (input.channel === "EMAIL_FORWARD") {
    const from = typeof input.metadata.from === "string" ? input.metadata.from : "";
    const vendorFromEmail = extractVendorFromEmail(from);
    if (vendorFromEmail) {
      return {
        value: vendorFromEmail,
        confidence: 0.84
      };
    }
  }

  const textPattern =
    /\b(?:your|the)?\s*([a-zA-Z][a-zA-Z0-9&' .-]{1,40})\s+(?:subscription|bill|statement|invoice|renewal|policy)\b/;
  const textMatch = input.rawText.match(textPattern);
  if (textMatch) {
    const candidate = cleanVendor(textMatch[1]);
    if (candidate) {
      return {
        value: candidate,
        confidence: 0.8
      };
    }
  }

  const fromForPattern = /\b(?:from|for)\s+([a-zA-Z][a-zA-Z0-9&' .-]{1,36})\b/;
  const fromForMatch = input.rawText.match(fromForPattern);
  if (fromForMatch) {
    const candidate = cleanVendor(fromForMatch[1]);
    if (candidate) {
      return {
        value: candidate,
        confidence: 0.68
      };
    }
  }

  const leadingPhrase = input.normalizedText
    .split(/\s+/)
    .slice(0, 3)
    .join(" ")
    .replace(/[^a-z0-9&' .-]/gi, "")
    .trim();

  const leadingVendor = cleanVendor(leadingPhrase);
  if (leadingVendor) {
    return {
      value: leadingVendor,
      confidence: 0.5
    };
  }

  return {
    value: null,
    confidence: 0
  };
}

function extractVendorFromEmail(rawFrom: string): string | null {
  const compact = rawFrom.trim();
  if (!compact) return null;

  const displayNameMatch = compact.match(/^([^<]+)</);
  if (displayNameMatch) {
    const candidate = cleanVendor(displayNameMatch[1]);
    if (candidate && candidate.toLowerCase() !== "no reply") {
      return candidate;
    }
  }

  const emailMatch = compact.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (!emailMatch) return null;

  const domain = emailMatch[1].toLowerCase();
  const root = domain.split(".")[0];
  if (!root || ["gmail", "outlook", "hotmail", "yahoo"].includes(root)) {
    return null;
  }

  return toTitleCase(root.replace(/[-_]+/g, " "));
}

function buildTitle(input: {
  titleHint?: string | null;
  vendor: { value: string | null; confidence: number };
  type: SupportedObligationType;
  rawText: string;
}): string | null {
  const cleanedHint = cleanTitle(input.titleHint);
  if (cleanedHint) {
    return cleanedHint;
  }

  if (input.vendor.value) {
    return `${input.vendor.value} ${typeLabel(input.type)}`;
  }

  const textSnippet = cleanTitle(input.rawText.split("\n")[0]);
  if (textSnippet) {
    return textSnippet;
  }

  return `${toTitleCase(input.type.toLowerCase())} obligation`;
}

function buildDescription(rawText: string, title: string | null) {
  const normalized = rawText
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const slice = normalized.slice(0, 220);
  if (title && slice.toLowerCase() === title.toLowerCase()) {
    return null;
  }

  return slice;
}

function cleanTitle(value?: string | null) {
  if (!value) return null;

  const normalized = value
    .replace(/^\s*(re|fw|fwd):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return normalized || null;
}

function cleanVendor(value: string) {
  const normalized = value
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(your|the)\s+/i, "")
    .replace(/\s+(subscription|bill|statement|invoice|renewal|policy)$/i, "")
    .trim();

  if (!normalized) return null;
  if (normalized.length < 2) return null;

  const tokens = normalized.toLowerCase().split(/\s+/);
  if (tokens.every((token) => stopVendorWords.has(token))) {
    return null;
  }

  return toTitleCase(normalized);
}

function typeLabel(type: SupportedObligationType) {
  switch (type) {
    case "BILL":
      return "bill";
    case "SUBSCRIPTION":
      return "subscription";
    case "RENEWAL":
      return "renewal";
    case "COMMITMENT":
    default:
      return "commitment";
  }
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function safeDate(year: number, monthIndex: number, day: number) {
  if (monthIndex < 0 || monthIndex > 11) return null;
  if (day < 1 || day > 31) return null;

  const candidate = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
  if (Number.isNaN(candidate.getTime())) return null;

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== monthIndex ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return candidate;
}

function addDaysAtNoon(date: Date, days: number) {
  const base = atNoon(date);
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

function atNoon(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0));
}

function inferYearForMonthDay(now: Date, month: number, day: number) {
  const currentYear = now.getUTCFullYear();
  const candidate = safeDate(currentYear, month - 1, day);
  if (!candidate) return currentYear;

  const threshold = addDaysAtNoon(now, -7).getTime();
  if (candidate.getTime() < threshold) {
    return currentYear + 1;
  }

  return currentYear;
}

function expandYear(year: number) {
  if (year < 100) {
    return 2000 + year;
  }
  return year;
}

function nextWeekdayAtNoon(now: Date, targetWeekday: number, explicitNext: boolean) {
  const base = atNoon(now);
  const todayWeekday = base.getUTCDay();
  let delta = (targetWeekday - todayWeekday + 7) % 7;

  if (delta === 0) {
    delta = 7;
  }

  if (explicitNext && delta < 2) {
    delta += 7;
  }

  return addDaysAtNoon(base, delta);
}
