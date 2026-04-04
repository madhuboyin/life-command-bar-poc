import {
  ObligationStatus,
  PredictionReferenceType,
  PredictionType,
  ReminderStatus
} from "@prisma/client";
import {
  buildPredictionRationaleSummary,
  clamp,
  round,
  toPredictionConfidenceBand
} from "./prediction.rationale";
import type { PredictionDraft } from "./prediction.types";

type OpenObligationInput = {
  id: string;
  title: string;
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  dueDate: Date | null;
  urgencyScore: number;
  importanceScore: number;
  confidenceScore: number;
  status: ObligationStatus;
  vendor: string | null;
};

type ReminderInput = {
  id: string;
  obligationId: string | null;
  title: string;
  scheduledFor: Date;
  status: ReminderStatus;
};

export function buildUpcomingAttentionFromObligations(input: {
  openObligations: OpenObligationInput[];
  now: Date;
}): PredictionDraft[] {
  const drafts: PredictionDraft[] = [];

  for (const item of input.openObligations) {
    if (item.status !== ObligationStatus.ACTIVE && item.status !== ObligationStatus.POSTPONED) {
      continue;
    }
    if (!item.dueDate) continue;

    const daysUntil = diffDays(item.dueDate, input.now);
    if (daysUntil < 0 || daysUntil > 30) continue;

    let confidenceScore = item.confidenceScore;
    if (daysUntil <= 7) confidenceScore += 0.08;
    if (item.urgencyScore >= 85) confidenceScore += 0.06;
    if (item.status === ObligationStatus.POSTPONED) confidenceScore += 0.04;
    confidenceScore = clamp(round(confidenceScore, 4), 0.35, 0.95);

    const rationale = {
      obligationId: item.id,
      obligationType: item.type,
      matchedVendor: item.vendor,
      dueDate: item.dueDate.toISOString(),
      daysUntil: round(daysUntil, 2),
      urgencyScore: item.urgencyScore,
      importanceScore: item.importanceScore,
      supportingSignals: [
        `status:${item.status.toLowerCase()}`,
        `urgency:${Math.round(item.urgencyScore)}`
      ],
      reason:
        daysUntil <= 7
          ? "Due soon and worth preparing for now."
          : "Upcoming soon enough to prepare calmly."
    };

    drafts.push({
      predictionType: PredictionType.UPCOMING_ATTENTION,
      referenceType: PredictionReferenceType.OBLIGATION,
      referenceId: item.id,
      title: `Prepare: ${item.title}`,
      description:
        daysUntil <= 7
          ? `${item.title} is due soon. Preparing now can prevent urgency.`
          : `${item.title} is approaching within 30 days.`,
      predictedDate: item.dueDate,
      predictionWindowStart: input.now,
      predictionWindowEnd: addDays(input.now, 30),
      confidenceScore,
      confidenceBand: toPredictionConfidenceBand(confidenceScore),
      rationale,
      rationaleSummary: buildPredictionRationaleSummary(rationale)
    });
  }

  return drafts;
}

export function buildWorkloadWindowPredictions(input: {
  openObligations: OpenObligationInput[];
  reminders: ReminderInput[];
  recurringDrafts: PredictionDraft[];
  now: Date;
}): PredictionDraft[] {
  const windows = [7, 14, 30];
  const drafts: PredictionDraft[] = [];

  for (const days of windows) {
    const windowStart = input.now;
    const windowEnd = addDays(input.now, days);
    const dueObligations = input.openObligations.filter((item) => {
      if (!item.dueDate) return false;
      return item.dueDate >= windowStart && item.dueDate <= windowEnd;
    });
    const dueReminders = input.reminders.filter(
      (item) => item.scheduledFor >= windowStart && item.scheduledFor <= windowEnd
    );
    const predictedRecurring = input.recurringDrafts.filter((item) => {
      if (!item.predictedDate) return false;
      return item.predictedDate >= windowStart && item.predictedDate <= windowEnd;
    });

    const weightedCount =
      dueObligations.length +
      predictedRecurring.length * 0.8 +
      dueReminders.length * 0.5;

    const workloadBand =
      weightedCount >= 6 ? "HEAVY" : weightedCount >= 3.2 ? "MODERATE" : "LIGHT";
    const confidenceScore = clamp(
      0.46 +
        Math.min(0.24, dueObligations.length * 0.05) +
        Math.min(0.16, predictedRecurring.length * 0.04) +
        Math.min(0.08, dueReminders.length * 0.02),
      0.35,
      0.9
    );

    const rationale = {
      windowDays: days,
      workloadBand,
      dueObligations: dueObligations.length,
      predictedRecurring: predictedRecurring.length,
      dueReminders: dueReminders.length,
      weightedCount: round(weightedCount, 2),
      supportingSignals: [
        `obligations:${dueObligations.length}`,
        `predicted:${predictedRecurring.length}`,
        `reminders:${dueReminders.length}`
      ],
      reason:
        workloadBand === "HEAVY"
          ? `Next ${days} days look heavier than usual.`
          : workloadBand === "MODERATE"
            ? `Next ${days} days look moderately busy.`
            : `Next ${days} days look relatively light.`
    };

    drafts.push({
      predictionType: PredictionType.WORKLOAD_WINDOW,
      referenceType: PredictionReferenceType.MEMORY_ENTITY,
      referenceId: `workload:${days}d`,
      title:
        workloadBand === "HEAVY"
          ? `Next ${days} days may be heavy`
          : workloadBand === "MODERATE"
            ? `Next ${days} days look moderate`
            : `Next ${days} days look light`,
      description:
        workloadBand === "HEAVY"
          ? `Expected workload is elevated with ${dueObligations.length} due items and ${predictedRecurring.length} expected recurring items.`
          : workloadBand === "MODERATE"
            ? `${dueObligations.length} due items and ${predictedRecurring.length} expected recurring items are likely in this window.`
            : "No dense admin cluster is expected in this window.",
      predictionWindowStart: windowStart,
      predictionWindowEnd: windowEnd,
      confidenceScore: round(confidenceScore, 4),
      confidenceBand: toPredictionConfidenceBand(confidenceScore),
      rationale,
      rationaleSummary: buildPredictionRationaleSummary(rationale)
    });
  }

  return drafts;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function diffDays(left: Date, right: Date) {
  return (left.getTime() - right.getTime()) / (1000 * 60 * 60 * 24);
}
