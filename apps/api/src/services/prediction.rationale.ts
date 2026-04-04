import { PredictionConfidenceBand } from "@prisma/client";

export function normalizePredictionScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

export function toPredictionConfidenceBand(value: number): PredictionConfidenceBand {
  const score = normalizePredictionScore(value);
  if (score >= 0.78) return PredictionConfidenceBand.HIGH;
  if (score >= 0.48) return PredictionConfidenceBand.MEDIUM;
  return PredictionConfidenceBand.LOW;
}

export function buildPredictionRationaleSummary(value: unknown) {
  const record = asRecord(value);
  if (!record) return "Based on observed historical patterns.";

  const reason = asString(record.reason);
  if (reason) return reason;

  const observedCount = asNumber(record.observedCount);
  const interval = asNumber(record.averageIntervalDays);
  if (typeof observedCount === "number" && typeof interval === "number") {
    return `Based on ${observedCount} prior occurrences about every ${Math.round(interval)} days.`;
  }

  const workloadBand = asString(record.workloadBand);
  if (workloadBand) {
    return `Expected ${workloadBand.toLowerCase()} workload from near-future obligations and patterns.`;
  }

  return "Based on observed historical patterns.";
}

export function round(value: number, places: number) {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

export function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
