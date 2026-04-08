import type { HumanLanguageKey } from "./human-language.dictionary";

export function toConfidenceKey(
  value: "HIGH" | "MEDIUM" | "LOW" | number | null | undefined
): HumanLanguageKey {
  if (typeof value === "number") {
    if (value >= 0.75) return "confidence.high";
    if (value >= 0.5) return "confidence.medium";
    return "confidence.low";
  }

  if (value === "HIGH") return "confidence.high";
  if (value === "MEDIUM") return "confidence.medium";
  return "confidence.low";
}

export function toStatusKey(
  value: "HIGH" | "MEDIUM" | "LOW" | number | null | undefined
): HumanLanguageKey {
  if (typeof value === "number") {
    if (value >= 0.75) return "status.looks_good";
    if (value >= 0.5) return "status.needs_review";
    return "status.not_sure_yet";
  }

  if (value === "HIGH") return "status.looks_good";
  if (value === "MEDIUM") return "status.needs_review";
  return "status.not_sure_yet";
}

export function toIssueKey(value: string | null | undefined): HumanLanguageKey | null {
  if (!value) return null;
  const normalized = normalize(value);

  if (
    normalized.includes("low_confidence") ||
    normalized.includes("medium_confidence") ||
    normalized.includes("weak")
  ) {
    return "signals.weak";
  }

  if (
    normalized.includes("conflict") ||
    normalized.includes("mismatch") ||
    normalized.includes("duplicate")
  ) {
    return "signals.conflict";
  }

  if (normalized.includes("unknown_state") || normalized.includes("lifecycle_unknown")) {
    return "lifecycle.unknown";
  }

  if (
    normalized.includes("pricing_uncertain") ||
    normalized.includes("price_uncertain") ||
    normalized.includes("price_not_confirmed")
  ) {
    return "pricing.uncertain";
  }

  if (normalized.includes("gmail") || normalized.includes("email")) {
    return "detected.gmail";
  }

  return null;
}

export function toRecommendationKey(
  value: string | null | undefined
): HumanLanguageKey {
  const normalized = normalize(value);

  if (normalized.includes("keep")) return "recommendation.keep";
  if (normalized.includes("cancel")) return "recommendation.cancel";
  if (normalized.includes("downgrade")) return "recommendation.downgrade";
  if (normalized.includes("confirm")) return "recommendation.confirm";
  if (normalized.includes("ignore")) return "recommendation.ignore";
  return "recommendation.review";
}

export function toActionKey(value: string | null | undefined): HumanLanguageKey {
  const normalized = normalize(value);

  if (normalized.includes("keep")) return "action.keep";
  if (normalized.includes("cancel")) return "action.cancel";
  if (normalized.includes("review")) return "action.review";
  if (normalized.includes("confirm")) return "action.confirm";
  if (normalized.includes("ignore") || normalized.includes("dismiss")) return "action.ignore";
  if (normalized.includes("remind")) return "action.remind";
  if (normalized.includes("detail")) return "action.details";
  if (normalized.includes("handle")) return "action.handle_now";
  if (normalized.includes("postpone")) return "action.postpone";
  return "action.start";
}

export function normalize(value: string | null | undefined) {
  if (!value) return "";

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
