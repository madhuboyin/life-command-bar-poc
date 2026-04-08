import type { SupportedObligationType } from "./ingestion.classifier";
import type {
  ObligationIntelligenceCategory,
  ObligationIntelligenceExtracted
} from "./obligation-intelligence.types";

type NormalizerInput = {
  category: ObligationIntelligenceCategory;
  extracted: ObligationIntelligenceExtracted;
  fallbackType: SupportedObligationType;
  fallbackTitle: string | null;
  fallbackVendor: string | null;
};

export type ObligationNormalizedResult = {
  canonicalType: SupportedObligationType;
  normalizedTitle: string | null;
  normalizedVendor: string | null;
  vendorNormalizedKey: string | null;
};

export function normalizeObligationIntelligence(input: NormalizerInput): ObligationNormalizedResult {
  const canonicalType = categoryToCanonicalType(input.category, input.fallbackType);
  const normalizedVendor = normalizeVendorName(input.extracted.vendorName ?? input.fallbackVendor);
  const normalizedTitle = normalizeTitle({
    title: input.extracted.title ?? input.fallbackTitle,
    normalizedVendor,
    category: input.category
  });

  return {
    canonicalType,
    normalizedTitle,
    normalizedVendor,
    vendorNormalizedKey: normalizeVendorKey(normalizedVendor)
  };
}

function categoryToCanonicalType(
  category: ObligationIntelligenceCategory,
  fallbackType: SupportedObligationType
): SupportedObligationType {
  if (category === "SUBSCRIPTION") return "SUBSCRIPTION";
  if (category === "SERVICE_RENEWAL") return "RENEWAL";
  if (category === "COMMITMENT" || category === "COMPLIANCE") return "COMMITMENT";
  if (
    category === "BILL" ||
    category === "STATEMENT" ||
    category === "PAYMENT_DUE" ||
    category === "UTILITY" ||
    category === "TELECOM" ||
    category === "INSURANCE" ||
    category === "CREDIT_CARD" ||
    category === "LOAN"
  ) {
    return "BILL";
  }

  return fallbackType;
}

function normalizeVendorName(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed
    .split(" ")
    .map((token) => token[0]?.toUpperCase() + token.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 120);
}

function normalizeVendorKey(value: string | null) {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function normalizeTitle(input: {
  title: string | null;
  normalizedVendor: string | null;
  category: ObligationIntelligenceCategory;
}) {
  if (input.title && input.title.trim().length >= 3) {
    return input.title.trim().replace(/\s+/g, " ").slice(0, 160);
  }

  if (input.normalizedVendor) {
    return `${input.normalizedVendor} ${input.category.toLowerCase().replace(/_/g, " ")}`;
  }

  return null;
}

