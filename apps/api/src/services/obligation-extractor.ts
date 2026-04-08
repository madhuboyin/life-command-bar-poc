import type {
  ObligationIntelligenceClassified,
  ObligationIntelligenceConfidenceBand,
  ObligationIntelligenceExtracted
} from "./obligation-intelligence.types";
import { toConfidenceBand } from "../utils/trust-layer";

type ExtractorInput = {
  rawText: string;
  normalizedText: string;
  titleHint?: string | null;
  metadata: Record<string, unknown>;
  classified: ObligationIntelligenceClassified;
  now: Date;
};

const currencyMap: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP"
};

export function extractObligationIntelligenceFields(
  input: ExtractorInput
): ObligationIntelligenceExtracted {
  const text = input.rawText;
  const normalized = input.normalizedText;
  const extractionSignals: string[] = [];
  const conflictingSignals: string[] = [];

  const amount = extractAmount(text);
  if (amount.amount !== null) {
    extractionSignals.push(amount.reason);
  }

  const dueDate = extractDateByPatterns(text, input.now, [
    /\b(?:payment\s+due|amount\s+due|bill(?:ing)?\s+due|due date|pay by)\b[^0-9a-z]{0,14}([a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|20\d{2}-\d{1,2}-\d{1,2})/i,
    /\b(?:due)\s+(?:on\s+)?([a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|20\d{2}-\d{1,2}-\d{1,2})/i
  ]);
  if (dueDate.value) extractionSignals.push("due_date_detected");

  const paymentDueDate = extractDateByPatterns(text, input.now, [
    /\b(?:minimum payment due|payment due)\b[^0-9a-z]{0,14}([a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|20\d{2}-\d{1,2}-\d{1,2})/i
  ]);
  if (paymentDueDate.value) extractionSignals.push("payment_due_date_detected");

  const statementDate = extractDateByPatterns(text, input.now, [
    /\b(?:statement (?:date|period ending)|statement ready as of)\b[^0-9a-z]{0,14}([a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|20\d{2}-\d{1,2}-\d{1,2})/i
  ]);
  if (statementDate.value) extractionSignals.push("statement_date_detected");

  const renewalDate = extractDateByPatterns(text, input.now, [
    /\b(?:renews?\s+on|renewal date|next renewal)\b[^0-9a-z]{0,14}([a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|20\d{2}-\d{1,2}-\d{1,2})/i,
    /\b(?:expires?\s+on)\b[^0-9a-z]{0,14}([a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|20\d{2}-\d{1,2}-\d{1,2})/i
  ]);
  if (renewalDate.value) extractionSignals.push("renewal_date_detected");

  if (amount.amount !== null && /\bpayment received\b/i.test(text) && /\bamount due|minimum payment\b/i.test(text)) {
    conflictingSignals.push("payment_received_and_due_language");
  }

  if (
    paymentDueDate.value &&
    statementDate.value &&
    paymentDueDate.value === statementDate.value &&
    /\bstatement\b/i.test(text)
  ) {
    conflictingSignals.push("statement_date_matches_payment_due_date");
  }

  const subject = asString(input.metadata.subject);
  const messageDate = asString(input.metadata.messageDate) ?? asString(input.metadata.internalDate);
  const vendorName = extractVendorName(input);
  const vendorNormalizedKey = vendorName ? normalizeVendorKey(vendorName) : null;
  const title = buildTitle(input.titleHint, vendorName, input.classified.obligationCategory);
  const recurrenceHint = extractRecurrenceHint(normalized);
  const statusHint = inferStatusHint({
    normalizedText: normalized,
    dueDate: dueDate.value ?? paymentDueDate.value,
    renewalDate: renewalDate.value,
    statementDate: statementDate.value
  });

  const blendedScore = clamp(
    input.classified.confidenceScore * 0.55 +
      amount.confidence * 0.1 +
      dueDate.confidence * 0.12 +
      paymentDueDate.confidence * 0.08 +
      renewalDate.confidence * 0.08 +
      (vendorName ? 0.07 : 0) -
      conflictingSignals.length * 0.08,
    0.16,
    0.98
  );

  return {
    title,
    vendorName,
    vendorNormalizedKey,
    obligationCategory: input.classified.obligationCategory,
    amount: amount.amount,
    currency: amount.currency,
    dueDate: dueDate.value,
    statementDate: statementDate.value,
    paymentDueDate: paymentDueDate.value,
    renewalDate: renewalDate.value,
    recurrenceHint,
    statusHint,
    sourceEmailSubject: subject,
    sourceEmailDate: messageDate,
    confidenceScore: blendedScore,
    confidenceBand: toConfidenceBand(blendedScore) as ObligationIntelligenceConfidenceBand,
    extractionSignals,
    conflictingSignals
  };
}

function extractAmount(rawText: string): {
  amount: number | null;
  currency: string | null;
  confidence: number;
  reason: string;
} {
  const duePattern =
    /\b(?:amount due|balance due|minimum payment|payment due|statement balance)\b[^0-9$€£]{0,14}(?:USD|EUR|GBP|CAD|AUD|[$€£])?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;
  const dueMatch = rawText.match(duePattern);
  if (dueMatch) {
    return {
      amount: parseAmount(dueMatch[1]),
      currency: extractCurrency(rawText, dueMatch.index ?? 0),
      confidence: 0.88,
      reason: "amount_due_detected"
    };
  }

  const genericPattern = /\b(?:USD|EUR|GBP|CAD|AUD)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b|([$€£])\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;
  const genericMatch = rawText.match(genericPattern);
  if (genericMatch) {
    const amountRaw = genericMatch[1] ?? genericMatch[3] ?? null;
    if (!amountRaw) {
      return { amount: null, currency: null, confidence: 0, reason: "amount_missing" };
    }
    return {
      amount: parseAmount(amountRaw),
      currency:
        genericMatch[1] && genericMatch[0]
          ? genericMatch[0].slice(0, 3).toUpperCase()
          : currencyMap[genericMatch[2] ?? ""] ?? null,
      confidence: 0.74,
      reason: "amount_generic_detected"
    };
  }

  return { amount: null, currency: null, confidence: 0, reason: "amount_missing" };
}

function extractDateByPatterns(
  rawText: string,
  now: Date,
  patterns: RegExp[]
): { value: string | null; confidence: number } {
  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    const rawDate = match?.[1]?.trim();
    if (!rawDate) continue;
    const parsed = parseDateLike(rawDate, now);
    if (parsed) {
      return {
        value: parsed.toISOString(),
        confidence: 0.86
      };
    }
  }

  return {
    value: null,
    confidence: 0
  };
}

function parseDateLike(value: string, now: Date) {
  const normalized = value.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    return safeDate(year, month - 1, day);
  }

  if (/^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(normalized)) {
    const [m, d, y] = normalized.split(/[/-]/).map(Number);
    const year = Number.isFinite(y) ? expandYear(y) : inferYear(now, m, d);
    return safeDate(year, m - 1, d);
  }

  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) {
    return atNoon(date);
  }

  return null;
}

function safeDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function atNoon(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
}

function expandYear(value: number) {
  if (value >= 1000) return value;
  return value >= 70 ? 1900 + value : 2000 + value;
}

function inferYear(now: Date, month: number, day: number) {
  const currentYear = now.getUTCFullYear();
  const candidate = safeDate(currentYear, month - 1, day);
  if (!candidate) return currentYear;
  if (candidate.getTime() < now.getTime() - 48 * 60 * 60 * 1000) {
    return currentYear + 1;
  }
  return currentYear;
}

function extractCurrency(rawText: string, index: number) {
  const window = rawText.slice(Math.max(0, index - 10), Math.min(rawText.length, index + 24));
  const codeMatch = window.match(/\b(USD|EUR|GBP|CAD|AUD)\b/i);
  if (codeMatch) return codeMatch[1].toUpperCase();
  const symbolMatch = window.match(/([$€£])/);
  if (symbolMatch) return currencyMap[symbolMatch[1]] ?? null;
  return null;
}

function parseAmount(raw: string) {
  const numeric = Number(raw.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function extractVendorName(input: ExtractorInput) {
  const from = asString(input.metadata.from);
  if (from) {
    const emailMatch = from.match(/<([^>]+)>/);
    const fallback = emailMatch?.[1] ?? from;
    const domain = fallback.split("@")[1];
    if (domain) {
      const firstPart = domain.split(".")[0];
      const cleaned = firstPart.replace(/[^a-zA-Z0-9]+/g, " ").trim();
      if (cleaned.length >= 2) {
        return toTitleCase(cleaned);
      }
    }
  }

  const subject = input.titleHint ?? asString(input.metadata.subject);
  if (subject) {
    const tokenMatch = subject.match(/^([A-Za-z0-9&+\- ]{2,40})[:\-]/);
    if (tokenMatch) {
      return tokenMatch[1].trim();
    }
  }

  return null;
}

function buildTitle(
  titleHint: string | null | undefined,
  vendor: string | null,
  category: ObligationIntelligenceClassified["obligationCategory"]
) {
  if (titleHint && titleHint.trim().length >= 4) {
    return titleHint.trim().slice(0, 140);
  }

  if (vendor) {
    return `${vendor} ${category.toLowerCase().replace(/_/g, " ")}`;
  }

  return null;
}

function extractRecurrenceHint(text: string) {
  if (/\bmonthly\b/.test(text)) return "MONTHLY";
  if (/\byearly|annual(?:ly)?\b/.test(text)) return "YEARLY";
  if (/\bquarterly\b/.test(text)) return "QUARTERLY";
  if (/\bweekly\b/.test(text)) return "WEEKLY";
  return null;
}

function inferStatusHint(input: {
  normalizedText: string;
  dueDate: string | null;
  renewalDate: string | null;
  statementDate: string | null;
}): ObligationIntelligenceExtracted["statusHint"] {
  if (input.renewalDate) return "RENEWING";
  if (input.dueDate) return "DUE";
  if (input.statementDate) return "STATEMENT_READY";
  if (/\bcoming soon|upcoming\b/.test(input.normalizedText)) return "UPCOMING";
  return "UNKNOWN";
}

function normalizeVendorKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

