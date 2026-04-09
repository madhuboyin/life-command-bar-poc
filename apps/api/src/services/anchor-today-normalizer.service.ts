import {
  AnchorCategory,
  AnchorConfidence,
  AnchorRecurrenceType,
  type TrackedAnchor,
  ObligationStatus,
  ScopeType
} from "@prisma/client";
import { AnchorTrackingEngineService } from "./anchor-tracking-engine.service";
import type { AnchorDueEvaluation } from "../types/anchor-tracking.types";
import type { TodayPrioritizationInput } from "./today-prioritization.service";
import { toTrackedAnchorTodayItemId } from "../utils/tracked-anchor-today-id";

const MAX_STRONG_ANCHOR_CANDIDATES = 3;
const MAX_WEAK_TIMING_CANDIDATES = 1;
const WEAK_TIMING_RESURFACE_DAYS = 14;

type AnchorTodayCandidate = {
  candidate: TodayPrioritizationInput;
  anchorId: string;
  dueEvaluation: AnchorDueEvaluation;
};

export class AnchorTodayNormalizerService {
  private readonly trackingEngine: AnchorTrackingEngineService;

  constructor(dependencies: { trackingEngine?: AnchorTrackingEngineService } = {}) {
    this.trackingEngine = dependencies.trackingEngine ?? new AnchorTrackingEngineService();
  }

  normalizeAnchorsForToday(input: {
    anchors: TrackedAnchor[];
    suppressionKeys?: Set<string>;
    now?: Date;
  }): AnchorTodayCandidate[] {
    const now = input.now ?? new Date();
    const suppressionKeys = input.suppressionKeys ?? new Set<string>();
    const strongCandidates: AnchorTodayCandidate[] = [];
    const weakTimingCandidates: AnchorTodayCandidate[] = [];

    for (const anchor of input.anchors) {
      const dueEvaluation = this.trackingEngine.evaluateAnchorDueStatus(
        {
          recurrenceType: anchor.recurrenceType,
          recurrenceInterval: anchor.recurrenceInterval,
          recurrenceUnit: anchor.recurrenceUnit,
          nextExpectedDate: anchor.nextExpectedDate,
          expectedWindowStart: anchor.expectedWindowStart,
          expectedWindowEnd: anchor.expectedWindowEnd,
          reminderLeadDays: anchor.reminderLeadDays,
          lastSnoozedUntil: anchor.lastSnoozedUntil,
          status: anchor.status,
          confidence: anchor.confidence
        },
        now
      );

      if (!shouldSurfaceAnchor(anchor, dueEvaluation, now)) {
        continue;
      }

      const overlapKey = buildOverlapKey(anchor);
      if (overlapKey && suppressionKeys.has(overlapKey)) {
        continue;
      }

      const candidate = normalizeAnchorCandidate(anchor, dueEvaluation);
      if (dueEvaluation.reason === "INSUFFICIENT_TIMING") {
        weakTimingCandidates.push({
          candidate,
          anchorId: anchor.id,
          dueEvaluation
        });
      } else {
        strongCandidates.push({
          candidate,
          anchorId: anchor.id,
          dueEvaluation
        });
      }
    }

    strongCandidates.sort((a, b) => {
      const priorityDelta = (b.candidate.priorityHintScore ?? 0) - (a.candidate.priorityHintScore ?? 0);
      if (priorityDelta !== 0) return priorityDelta;
      return a.candidate.title.localeCompare(b.candidate.title);
    });
    weakTimingCandidates.sort((a, b) => a.candidate.title.localeCompare(b.candidate.title));

    return [
      ...strongCandidates.slice(0, MAX_STRONG_ANCHOR_CANDIDATES),
      ...weakTimingCandidates.slice(0, MAX_WEAK_TIMING_CANDIDATES)
    ];
  }
}

function normalizeAnchorCandidate(
  anchor: TrackedAnchor,
  dueEvaluation: AnchorDueEvaluation
): TodayPrioritizationInput {
  const type = toTodayType(anchor.category);
  const confidenceScore = toConfidenceScore(anchor.confidence);
  const confidenceBand = toConfidenceBand(confidenceScore);
  const urgencyScore = toUrgencyScore(dueEvaluation);
  const importanceScore = toImportanceScore(anchor.category);
  const priorityHintScore = clamp(
    Math.round((urgencyScore + importanceScore) / 2 + (dueEvaluation.reason === "AFTER_WINDOW" ? 8 : 0)),
    20,
    99
  );
  const needsReview =
    dueEvaluation.reason === "INSUFFICIENT_TIMING" ||
    anchor.recurrenceType === AnchorRecurrenceType.UNKNOWN;

  return {
    id: toTrackedAnchorTodayItemId(anchor.id),
    itemType: "TRACKED_ANCHOR",
    title: anchor.label,
    subtitle: buildAnchorSubtitle(anchor),
    category: anchor.category,
    type,
    status: ObligationStatus.ACTIVE,
    vendorName: anchor.label,
    amount: anchor.expectedAmount === null ? null : Number(anchor.expectedAmount),
    currency: anchor.currencyCode,
    dueDate: isDueStyleCategory(anchor.category)
      ? anchor.nextExpectedDate?.toISOString() ?? null
      : null,
    renewalDate: isRenewalStyleCategory(anchor.category)
      ? anchor.nextExpectedDate?.toISOString() ?? null
      : null,
    priorityHintScore,
    confidenceBand,
    confidenceScore,
    urgencyScore,
    importanceScore,
    needsReview,
    sourceSummary: "You asked us to keep an eye on this.",
    scopeType: ScopeType.PERSONAL,
    assignee: null,
    lastActedAt: anchor.lastConfirmedAt?.toISOString() ?? null,
    subscriptionId: null,
    trackedAnchor: {
      anchorId: anchor.id,
      category: anchor.category,
      dueReason: dueEvaluation.reason,
      dueUrgency: dueEvaluation.urgency,
      recurrenceType: anchor.recurrenceType,
      timingKnown: Boolean(
        anchor.nextExpectedDate ||
          (anchor.expectedWindowStart && anchor.expectedWindowEnd)
      )
    }
  };
}

function shouldSurfaceAnchor(
  anchor: TrackedAnchor,
  dueEvaluation: AnchorDueEvaluation,
  now: Date
) {
  if (anchor.status !== "ACTIVE") return false;
  if (dueEvaluation.reason === "SNOOZED" || dueEvaluation.reason === "INACTIVE") return false;
  if (dueEvaluation.isEligibleForSurfacing) return true;

  if (dueEvaluation.reason !== "INSUFFICIENT_TIMING") {
    return false;
  }

  const mostRecentAnchorTouch =
    anchor.lastSurfacedAt ?? anchor.lastConfirmedAt ?? anchor.createdAt;
  const daysSinceSeen =
    (now.getTime() - mostRecentAnchorTouch.getTime()) / (24 * 60 * 60 * 1000);

  return daysSinceSeen >= WEAK_TIMING_RESURFACE_DAYS;
}

function buildAnchorSubtitle(anchor: TrackedAnchor) {
  if (anchor.nextExpectedDate) {
    return `Likely around ${formatDate(anchor.nextExpectedDate)}`;
  }

  if (anchor.expectedWindowStart && anchor.expectedWindowEnd) {
    return `Likely between ${formatDate(anchor.expectedWindowStart)} and ${formatDate(
      anchor.expectedWindowEnd
    )}`;
  }

  return "Timing is still approximate";
}

function toTodayType(category: AnchorCategory): "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT" {
  if (category === AnchorCategory.SUBSCRIPTION || category === AnchorCategory.MEMBERSHIP) {
    return "SUBSCRIPTION";
  }

  if (category === AnchorCategory.INSURANCE) {
    return "RENEWAL";
  }

  if (
    category === AnchorCategory.BILL ||
    category === AnchorCategory.LOAN ||
    category === AnchorCategory.TAX
  ) {
    return "BILL";
  }

  return "COMMITMENT";
}

function toConfidenceScore(confidence: AnchorConfidence) {
  if (confidence === AnchorConfidence.GMAIL_CONFIRMED) return 0.9;
  if (confidence === AnchorConfidence.SYSTEM_INFERRED) return 0.64;
  return 0.78;
}

function toConfidenceBand(
  confidenceScore: number
): "HIGH" | "MEDIUM" | "LOW" {
  if (confidenceScore >= 0.85) return "HIGH";
  if (confidenceScore >= 0.7) return "MEDIUM";
  return "LOW";
}

function toUrgencyScore(dueEvaluation: AnchorDueEvaluation) {
  const base =
    dueEvaluation.urgency === "HIGH"
      ? 92
      : dueEvaluation.urgency === "MEDIUM"
        ? 78
        : dueEvaluation.urgency === "LOW"
          ? 64
          : 48;

  if (dueEvaluation.reason === "AFTER_WINDOW") {
    return Math.min(98, base + 6);
  }

  if (dueEvaluation.reason === "INSUFFICIENT_TIMING") {
    return 46;
  }

  return base;
}

function toImportanceScore(category: AnchorCategory) {
  if (category === AnchorCategory.BILL || category === AnchorCategory.LOAN || category === AnchorCategory.TAX) {
    return 74;
  }

  if (category === AnchorCategory.INSURANCE) return 70;
  if (category === AnchorCategory.SUBSCRIPTION) return 64;
  if (category === AnchorCategory.MEMBERSHIP) return 60;
  return 54;
}

function isDueStyleCategory(category: AnchorCategory) {
  return (
    category === AnchorCategory.BILL ||
    category === AnchorCategory.LOAN ||
    category === AnchorCategory.TAX ||
    category === AnchorCategory.OTHER
  );
}

function isRenewalStyleCategory(category: AnchorCategory) {
  return (
    category === AnchorCategory.SUBSCRIPTION ||
    category === AnchorCategory.MEMBERSHIP ||
    category === AnchorCategory.INSURANCE
  );
}

function buildOverlapKey(anchor: TrackedAnchor) {
  const normalized = anchor.normalizedLabel ?? normalizeTitle(anchor.label);
  return normalized || null;
}

function normalizeTitle(value: string | null | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
