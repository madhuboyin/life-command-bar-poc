import type {
  EmotionalActionType,
  EmotionalRiskLevel
} from "./emotional-trust.dictionary";

export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export function toEmotionalActionType(value: string | null | undefined): EmotionalActionType {
  const normalized = normalize(value);
  if (!normalized) return "OTHER";

  if (normalized.includes("keep")) return "KEEP";
  if (normalized.includes("cancel")) return "CANCEL";
  if (normalized.includes("remind") || normalized.includes("postpone")) return "REMIND_LATER";
  if (normalized.includes("review")) return "REVIEW";
  if (normalized.includes("confirm") || normalized.includes("done")) return "CONFIRM";
  if (normalized.includes("ignore") || normalized.includes("dismiss")) return "IGNORE";
  if (normalized.includes("start") || normalized.includes("guided")) return "START";
  if (normalized.includes("detail") || normalized.includes("open")) return "DETAILS";
  return "OTHER";
}

export function toConfidenceBand(
  value: ConfidenceBand | number | null | undefined
): ConfidenceBand {
  if (typeof value === "number") {
    if (value >= 0.75) return "HIGH";
    if (value >= 0.5) return "MEDIUM";
    return "LOW";
  }

  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
  return "LOW";
}

export function toEmotionalRiskLevel(input: {
  riskLevel?: string | null;
  priorityBand?: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueAt?: string | null;
  renewsAt?: string | null;
}): EmotionalRiskLevel {
  const risk = normalize(input.riskLevel);
  if (risk.includes("high")) return "HIGH";
  if (risk.includes("medium")) return "MEDIUM";
  if (risk.includes("low")) return "LOW";

  if (input.priorityBand === "URGENT" || input.priorityBand === "HIGH") return "HIGH";
  if (input.priorityBand === "MEDIUM") return "MEDIUM";

  const dueSoon = isWithinDays(input.dueAt, 5);
  const renewsSoon = isWithinDays(input.renewsAt, 7);
  if (dueSoon) return "HIGH";
  if (renewsSoon) return "MEDIUM";
  return "LOW";
}

export function shouldBeSafeToWait(input: {
  riskLevel: EmotionalRiskLevel;
  confidenceBand: ConfidenceBand;
  needsReview?: boolean;
  canWait?: boolean | null;
}) {
  if (typeof input.canWait === "boolean") return input.canWait;
  if (input.riskLevel === "HIGH") return false;
  if (input.needsReview && input.confidenceBand === "LOW") return false;
  return true;
}

function isWithinDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const diffMs = parsed.getTime() - Date.now();
  const threshold = days * 24 * 60 * 60 * 1000;
  return diffMs <= threshold;
}

function normalize(value: string | null | undefined) {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
