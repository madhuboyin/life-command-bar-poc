import {
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorSource,
  type Prisma,
  type TrackedAnchor
} from "@prisma/client";
import { createAuditEvent } from "../observability/audit-event";
import { TrackedAnchorRepository } from "../repositories/tracked-anchor.repository";
import type { UpdateTrackedAnchorInput } from "../types/anchor-tracking.types";
import { AnchorTrackingEngineService } from "./anchor-tracking-engine.service";
import { AnchorTrackingRolloutService } from "./anchor-tracking-rollout.service";
import {
  evaluateAnchorObligationMatch,
  inferRecurrenceFromText,
  mapAnchorCategoryFromObligationType,
  type AnchorObligationSignal
} from "./anchor-obligation-match.service";

const DAY_MS = 24 * 60 * 60 * 1000;

type GmailAnchorSignal = AnchorObligationSignal & {
  observedAt: Date;
  metadata?: Record<string, unknown> | null;
};

export type AnchorGmailEnrichmentResult = {
  status:
    | "SKIPPED"
    | "NO_MATCH"
    | "AMBIGUOUS"
    | "CONFIRMED"
    | "ERROR_FALLBACK";
  reason:
    | "ROLLOUT_DISABLED"
    | "NO_ACTIVE_ANCHORS"
    | "MATCH_NOT_FOUND"
    | "MATCH_AMBIGUOUS"
    | "CONFIRMED"
    | "ERROR";
  anchorId: string | null;
  obligationId: string;
  matchScore: number | null;
};

type Dependencies = {
  repository?: TrackedAnchorRepository;
  trackingEngine?: AnchorTrackingEngineService;
  rolloutService?: AnchorTrackingRolloutService;
  now?: () => Date;
  emitAuditEvent?: typeof createAuditEvent;
};

export class AnchorGmailEnrichmentService {
  private readonly repository: TrackedAnchorRepository;
  private readonly trackingEngine: AnchorTrackingEngineService;
  private readonly rolloutService: AnchorTrackingRolloutService;
  private readonly now: () => Date;
  private readonly emitAuditEvent: typeof createAuditEvent;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? new TrackedAnchorRepository();
    this.trackingEngine =
      dependencies.trackingEngine ?? new AnchorTrackingEngineService();
    this.rolloutService =
      dependencies.rolloutService ?? new AnchorTrackingRolloutService();
    this.now = dependencies.now ?? (() => new Date());
    this.emitAuditEvent = dependencies.emitAuditEvent ?? createAuditEvent;
  }

  async enrichFromGmailSignal(input: {
    userId: string;
    signal: GmailAnchorSignal;
  }): Promise<AnchorGmailEnrichmentResult> {
    const rolloutState = this.rolloutService.getState();
    if (!rolloutState.step4Enabled || !rolloutState.gmailEnrichmentEnabled) {
      return {
        status: "SKIPPED",
        reason: "ROLLOUT_DISABLED",
        anchorId: null,
        obligationId: input.signal.obligationId,
        matchScore: null
      };
    }

    try {
      const anchors = await this.repository.listActiveForUser(input.userId);
      if (anchors.length === 0) {
        await this.emitAuditEvent({
          userId: input.userId,
          eventType: "anchor_matching_failed",
          metadata: {
            obligationId: input.signal.obligationId,
            reason: "no_active_anchors"
          }
        });
        return {
          status: "NO_MATCH",
          reason: "NO_ACTIVE_ANCHORS",
          anchorId: null,
          obligationId: input.signal.obligationId,
          matchScore: null
        };
      }

      const ranked = anchors
        .map((anchor) => ({
          anchor,
          match: evaluateAnchorObligationMatch(anchor, input.signal)
        }))
        .sort((left, right) => right.match.score - left.match.score);

      const best = ranked[0];
      const second = ranked[1] ?? null;
      if (!best || best.match.strength === "NONE") {
        await this.emitAuditEvent({
          userId: input.userId,
          eventType: "anchor_matching_failed",
          metadata: {
            obligationId: input.signal.obligationId,
            reason: "no_strong_match"
          }
        });
        return {
          status: "NO_MATCH",
          reason: "MATCH_NOT_FOUND",
          anchorId: null,
          obligationId: input.signal.obligationId,
          matchScore: best?.match.score ?? null
        };
      }

      if (
        best.match.strength !== "STRONG" ||
        (second &&
          Math.abs(best.match.score - second.match.score) <= 0.06 &&
          second.match.score >= 0.62)
      ) {
        await this.emitAuditEvent({
          userId: input.userId,
          eventType: "anchor_matching_ambiguous",
          metadata: {
            obligationId: input.signal.obligationId,
            topAnchorId: best.anchor.id,
            topScore: best.match.score,
            secondAnchorId: second?.anchor.id ?? null,
            secondScore: second?.match.score ?? null
          }
        });
        return {
          status: "AMBIGUOUS",
          reason: "MATCH_AMBIGUOUS",
          anchorId: best.anchor.id,
          obligationId: input.signal.obligationId,
          matchScore: best.match.score
        };
      }

      const anchor = best.anchor;
      await this.repository.markObserved(
        anchor.id,
        input.userId,
        input.signal.observedAt
      );

      const updatePatch = buildEnrichmentPatch({
        anchor,
        signal: input.signal,
        now: this.now(),
        trackingEngine: this.trackingEngine,
        timingRefinementEnabled: rolloutState.timingRefinementEnabled
      });

      const updatedAnchor = await this.repository.updateAnchor(
        anchor.id,
        input.userId,
        updatePatch
      );

      if (!updatedAnchor) {
        return {
          status: "NO_MATCH",
          reason: "MATCH_NOT_FOUND",
          anchorId: anchor.id,
          obligationId: input.signal.obligationId,
          matchScore: best.match.score
        };
      }

      await this.emitAuditEvent({
        userId: input.userId,
        obligationId: input.signal.obligationId,
        eventType: "anchor_confirmed_by_gmail",
        metadata: {
          anchorId: updatedAnchor.id,
          matchScore: best.match.score,
          linkedObligationId: updatedAnchor.linkedObligationId,
          confidence: updatedAnchor.confidence,
          source: updatedAnchor.source
        }
      });

      if (
        rolloutState.timingRefinementEnabled &&
        updatePatch.nextExpectedDate &&
        anchor.nextExpectedDate?.toISOString() !==
          asDate(updatePatch.nextExpectedDate)?.toISOString()
      ) {
        await this.emitAuditEvent({
          userId: input.userId,
          obligationId: input.signal.obligationId,
          eventType: "anchor_timing_refined",
          metadata: {
            anchorId: updatedAnchor.id,
            previousNextExpectedDate: anchor.nextExpectedDate?.toISOString() ?? null,
            refinedNextExpectedDate:
              asDate(updatePatch.nextExpectedDate)?.toISOString() ?? null,
            previousWindowStart: anchor.expectedWindowStart?.toISOString() ?? null,
            refinedWindowStart:
              asDate(updatePatch.expectedWindowStart)?.toISOString() ?? null,
            previousWindowEnd: anchor.expectedWindowEnd?.toISOString() ?? null,
            refinedWindowEnd:
              asDate(updatePatch.expectedWindowEnd)?.toISOString() ?? null
          }
        });
      }

      return {
        status: "CONFIRMED",
        reason: "CONFIRMED",
        anchorId: updatedAnchor.id,
        obligationId: input.signal.obligationId,
        matchScore: best.match.score
      };
    } catch (error) {
      await this.emitAuditEvent({
        userId: input.userId,
        eventType: "anchor_fallback_used",
        metadata: {
          obligationId: input.signal.obligationId,
          stage: "gmail_enrichment",
          reason:
            error instanceof Error ? error.message : "unknown_enrichment_error"
        }
      });
      return {
        status: "ERROR_FALLBACK",
        reason: "ERROR",
        anchorId: null,
        obligationId: input.signal.obligationId,
        matchScore: null
      };
    }
  }
}

function buildEnrichmentPatch(input: {
  anchor: TrackedAnchor;
  signal: GmailAnchorSignal;
  now: Date;
  trackingEngine: AnchorTrackingEngineService;
  timingRefinementEnabled: boolean;
}): UpdateTrackedAnchorInput {
  const recurrenceInference = inferRecurrenceFromText(input.signal.recurrence);
  const nextRecurrenceType =
    input.anchor.recurrenceType === AnchorRecurrenceType.UNKNOWN &&
    recurrenceInference.recurrenceType !== AnchorRecurrenceType.UNKNOWN
      ? recurrenceInference.recurrenceType
      : input.anchor.recurrenceType;
  const nextRecurrenceInterval =
    input.anchor.recurrenceInterval ??
    recurrenceInference.recurrenceInterval ??
    null;
  const nextRecurrenceUnit =
    input.anchor.recurrenceUnit ?? recurrenceInference.recurrenceUnit ?? null;

  const patch: UpdateTrackedAnchorInput = {
    linkedObligationId: input.signal.obligationId,
    confidence: AnchorConfidence.GMAIL_CONFIRMED,
    source:
      input.anchor.source === AnchorSource.USER_ADDED
        ? AnchorSource.USER_CONFIRMED_FROM_SIGNAL
        : input.anchor.source
  };

  if (input.anchor.category === "OTHER" && input.signal.obligationType) {
    patch.category = mapAnchorCategoryFromObligationType(input.signal.obligationType);
  }

  if (nextRecurrenceType !== input.anchor.recurrenceType) {
    patch.recurrenceType = nextRecurrenceType;
  }
  if (nextRecurrenceInterval !== input.anchor.recurrenceInterval) {
    patch.recurrenceInterval = nextRecurrenceInterval;
  }
  if (nextRecurrenceUnit !== input.anchor.recurrenceUnit) {
    patch.recurrenceUnit = nextRecurrenceUnit;
  }

  if (!input.timingRefinementEnabled) {
    return patch;
  }

  const refinedDate = computeRefinedNextExpectedDate({
    recurrenceType: nextRecurrenceType,
    recurrenceInterval: nextRecurrenceInterval,
    recurrenceUnit: nextRecurrenceUnit,
    signalDate: input.signal.dueDate ?? input.signal.observedAt,
    observedAt: input.signal.observedAt
  });

  if (!refinedDate) {
    return patch;
  }

  const window = input.trackingEngine.computeExpectedWindow(
    {
      recurrenceType: nextRecurrenceType,
      recurrenceInterval: nextRecurrenceInterval,
      recurrenceUnit: nextRecurrenceUnit,
      nextExpectedDate: refinedDate,
      expectedWindowStart: input.anchor.expectedWindowStart,
      expectedWindowEnd: input.anchor.expectedWindowEnd,
      reminderLeadDays: input.anchor.reminderLeadDays,
      lastSnoozedUntil: input.anchor.lastSnoozedUntil,
      status: input.anchor.status,
      confidence: AnchorConfidence.GMAIL_CONFIRMED
    },
    input.now
  );

  patch.nextExpectedDate = window.nextExpectedDate;
  patch.expectedWindowStart = window.expectedWindowStart;
  patch.expectedWindowEnd = window.expectedWindowEnd;

  return patch;
}

function computeRefinedNextExpectedDate(input: {
  recurrenceType: AnchorRecurrenceType;
  recurrenceInterval: number | null;
  recurrenceUnit: AnchorRecurrenceUnit | null;
  signalDate: Date;
  observedAt: Date;
}) {
  if (input.recurrenceType !== AnchorRecurrenceType.RECURRING) {
    return input.recurrenceType === AnchorRecurrenceType.ONE_TIME
      ? input.signalDate
      : null;
  }

  if (!input.recurrenceUnit) {
    return null;
  }

  const interval = normalizeInterval(input.recurrenceInterval);
  let nextExpected = addByUnit(input.signalDate, interval, input.recurrenceUnit);

  // Keep stepping to make sure the next expected date is after the observation.
  while (nextExpected.getTime() <= input.observedAt.getTime()) {
    nextExpected = addByUnit(nextExpected, interval, input.recurrenceUnit);
  }

  return nextExpected;
}

function normalizeInterval(value: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.floor(value);
}

function addByUnit(date: Date, interval: number, unit: AnchorRecurrenceUnit) {
  const unitToDays: Record<AnchorRecurrenceUnit, number> = {
    WEEK: 7,
    MONTH: 30,
    QUARTER: 90,
    YEAR: 365
  };
  return new Date(date.getTime() + unitToDays[unit] * interval * DAY_MS);
}

function asDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

export function toObservedAt(input: {
  messageDate: string | null;
  internalDate: string | null;
  fallbackNow: Date;
}) {
  const messageDate = parseDate(input.messageDate);
  if (messageDate) return messageDate;
  const internalDate = parseDate(input.internalDate);
  if (internalDate) return internalDate;
  return input.fallbackNow;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function toAnchorSignalConfidence(
  confidence: number | null | undefined
) {
  if (confidence === null || confidence === undefined) return null;
  if (!Number.isFinite(confidence)) return null;
  if (confidence < 0) return 0;
  if (confidence > 1) return 1;
  return confidence;
}

export function toAnchorSignalMetadata(
  input: {
    lifecycleEmailType: string;
    matchedQueryKey: string;
    confidenceBand: string;
  }
): Prisma.InputJsonObject {
  return {
    lifecycleEmailType: input.lifecycleEmailType,
    matchedQueryKey: input.matchedQueryKey,
    confidenceBand: input.confidenceBand
  };
}
