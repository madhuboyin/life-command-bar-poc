import {
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorStatus
} from "@prisma/client";
import type {
  AdvanceAnchorCycleResult,
  AnchorDueEvaluation,
  AnchorExpectedWindow,
  AnchorRecurrenceDefinition,
  TrackedAnchorTimingContext
} from "../types/anchor-tracking.types";

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_WINDOW_DAYS_BY_UNIT: Record<AnchorRecurrenceUnit, number> = {
  WEEK: 1,
  MONTH: 3,
  QUARTER: 7,
  YEAR: 14
};

const DEFAULT_REMINDER_LEAD_DAYS_BY_UNIT: Record<AnchorRecurrenceUnit, number> = {
  WEEK: 1,
  MONTH: 4,
  QUARTER: 10,
  YEAR: 21
};

const UNIT_TO_DAYS: Record<AnchorRecurrenceUnit, number> = {
  WEEK: 7,
  MONTH: 30,
  QUARTER: 90,
  YEAR: 365
};

const ONE_TIME_WINDOW_DAYS = 1;

type PartialTimingInput = {
  recurrenceType?: AnchorRecurrenceType | null;
  recurrenceInterval?: number | null;
  recurrenceUnit?: AnchorRecurrenceUnit | null;
  nextExpectedDate?: Date | null;
  reminderLeadDays?: number | null;
  confidence?: AnchorConfidence | null;
};

export class AnchorTrackingEngineService {
  computeExpectedWindow(anchor: TrackedAnchorTimingContext, now = new Date()): AnchorExpectedWindow {
    if (anchor.nextExpectedDate) {
      return buildWindowAroundExpectedDate({
        nextExpectedDate: anchor.nextExpectedDate,
        recurrenceType: anchor.recurrenceType,
        recurrenceUnit: anchor.recurrenceUnit,
        reminderLeadDays: anchor.reminderLeadDays,
        confidence: anchor.confidence
      });
    }

    return this.buildTimingFallback(anchor, now);
  }

  computeInitialExpectedWindow(input: PartialTimingInput, now = new Date()): AnchorExpectedWindow {
    if (input.nextExpectedDate) {
      return buildWindowAroundExpectedDate({
        nextExpectedDate: input.nextExpectedDate,
        recurrenceType: input.recurrenceType ?? AnchorRecurrenceType.UNKNOWN,
        recurrenceUnit: input.recurrenceUnit ?? null,
        reminderLeadDays: input.reminderLeadDays ?? null,
        confidence: input.confidence ?? AnchorConfidence.USER_PROVIDED
      });
    }

    return this.buildTimingFallback(
      {
        recurrenceType: input.recurrenceType ?? AnchorRecurrenceType.UNKNOWN,
        recurrenceInterval: input.recurrenceInterval ?? null,
        recurrenceUnit: input.recurrenceUnit ?? null,
        nextExpectedDate: null,
        reminderLeadDays: input.reminderLeadDays ?? null,
        confidence: input.confidence ?? AnchorConfidence.USER_PROVIDED
      },
      now
    );
  }

  evaluateAnchorDueStatus(anchor: TrackedAnchorTimingContext, now = new Date()): AnchorDueEvaluation {
    if (anchor.status !== AnchorStatus.ACTIVE) {
      return {
        isEligibleForSurfacing: false,
        reason: "INACTIVE",
        urgency: "NONE",
        nextCheckAt: null
      };
    }

    if (anchor.lastSnoozedUntil && anchor.lastSnoozedUntil.getTime() > now.getTime()) {
      return {
        isEligibleForSurfacing: false,
        reason: "SNOOZED",
        urgency: "NONE",
        nextCheckAt: anchor.lastSnoozedUntil
      };
    }

    const timing = this.computeExpectedWindow(anchor, now);
    if (!timing.expectedWindowStart || !timing.expectedWindowEnd) {
      return {
        isEligibleForSurfacing: false,
        reason: "INSUFFICIENT_TIMING",
        urgency: "NONE",
        nextCheckAt: null
      };
    }

    const nowTs = now.getTime();
    const startTs = timing.expectedWindowStart.getTime();
    const endTs = timing.expectedWindowEnd.getTime();

    if (nowTs < startTs) {
      const daysUntilWindow = Math.ceil((startTs - nowTs) / DAY_MS);
      return {
        isEligibleForSurfacing: false,
        reason: "BEFORE_WINDOW",
        urgency: daysUntilWindow <= 2 ? "LOW" : "NONE",
        nextCheckAt: timing.expectedWindowStart
      };
    }

    if (nowTs <= endTs) {
      const expectedTs = timing.nextExpectedDate?.getTime() ?? endTs;
      const daysFromExpected = Math.floor((nowTs - expectedTs) / DAY_MS);
      const urgency = daysFromExpected >= 1 ? "HIGH" : daysFromExpected >= 0 ? "MEDIUM" : "LOW";

      return {
        isEligibleForSurfacing: true,
        reason: "IN_WINDOW",
        urgency,
        nextCheckAt: timing.expectedWindowEnd
      };
    }

    return {
      isEligibleForSurfacing: true,
      reason: "AFTER_WINDOW",
      urgency: "HIGH",
      nextCheckAt: null
    };
  }

  advanceAnchorToNextCycle(
    anchor: Pick<
      TrackedAnchorTimingContext,
      | "recurrenceType"
      | "recurrenceInterval"
      | "recurrenceUnit"
      | "nextExpectedDate"
      | "reminderLeadDays"
      | "confidence"
    >,
    referenceDate?: Date
  ): AdvanceAnchorCycleResult {
    if (anchor.recurrenceType !== AnchorRecurrenceType.RECURRING) {
      return {
        advanced: false,
        nextExpectedDate: anchor.nextExpectedDate,
        expectedWindowStart: null,
        expectedWindowEnd: null,
        reason: "NON_RECURRING"
      };
    }

    if (!anchor.nextExpectedDate) {
      return {
        advanced: false,
        nextExpectedDate: null,
        expectedWindowStart: null,
        expectedWindowEnd: null,
        reason: "MISSING_NEXT_EXPECTED_DATE"
      };
    }

    if (!anchor.recurrenceUnit) {
      return {
        advanced: false,
        nextExpectedDate: anchor.nextExpectedDate,
        expectedWindowStart: null,
        expectedWindowEnd: null,
        reason: "UNSUPPORTED_RECURRENCE"
      };
    }

    const interval = normalizeInterval(anchor.recurrenceInterval);
    const floorDate = referenceDate ?? anchor.nextExpectedDate;
    let nextExpectedDate = anchor.nextExpectedDate;

    // Keep stepping until the next cycle is strictly after the reference point.
    while (nextExpectedDate.getTime() <= floorDate.getTime()) {
      nextExpectedDate = addByUnit(nextExpectedDate, interval, anchor.recurrenceUnit);
    }

    const window = buildWindowAroundExpectedDate({
      nextExpectedDate,
      recurrenceType: AnchorRecurrenceType.RECURRING,
      recurrenceUnit: anchor.recurrenceUnit,
      reminderLeadDays: anchor.reminderLeadDays,
      confidence: anchor.confidence
    });

    return {
      advanced: true,
      nextExpectedDate,
      expectedWindowStart: window.expectedWindowStart,
      expectedWindowEnd: window.expectedWindowEnd,
      reason: "ADVANCED"
    };
  }

  normalizeRecurrenceDefinition(input: {
    recurrenceType?: AnchorRecurrenceType | null;
    recurrenceInterval?: number | null;
    recurrenceUnit?: AnchorRecurrenceUnit | null;
  }): AnchorRecurrenceDefinition {
    const recurrenceType = input.recurrenceType ?? AnchorRecurrenceType.UNKNOWN;
    if (recurrenceType !== AnchorRecurrenceType.RECURRING) {
      return {
        recurrenceType,
        recurrenceInterval: null,
        recurrenceUnit: null
      };
    }

    return {
      recurrenceType,
      recurrenceInterval: normalizeInterval(input.recurrenceInterval),
      recurrenceUnit: input.recurrenceUnit ?? null
    };
  }

  buildTimingFallback(anchor: PartialTimingInput, now = new Date()): AnchorExpectedWindow {
    if (anchor.recurrenceType === AnchorRecurrenceType.ONE_TIME) {
      return {
        nextExpectedDate: null,
        expectedWindowStart: null,
        expectedWindowEnd: null,
        confidence: anchor.confidence ?? AnchorConfidence.USER_PROVIDED,
        reason: "ONE_TIME_FALLBACK"
      };
    }

    if (
      anchor.recurrenceType === AnchorRecurrenceType.RECURRING &&
      anchor.recurrenceUnit
    ) {
      const interval = normalizeInterval(anchor.recurrenceInterval);
      const nextExpectedDate = addByUnit(now, interval, anchor.recurrenceUnit);
      const window = buildWindowAroundExpectedDate({
        nextExpectedDate,
        recurrenceType: AnchorRecurrenceType.RECURRING,
        recurrenceUnit: anchor.recurrenceUnit,
        reminderLeadDays: anchor.reminderLeadDays ?? null,
        confidence: AnchorConfidence.SYSTEM_INFERRED
      });

      return {
        ...window,
        confidence: AnchorConfidence.SYSTEM_INFERRED,
        reason: "RECURRING_FALLBACK"
      };
    }

    return {
      nextExpectedDate: null,
      expectedWindowStart: null,
      expectedWindowEnd: null,
      confidence: anchor.confidence ?? AnchorConfidence.USER_PROVIDED,
      reason: "INSUFFICIENT_TIMING"
    };
  }
}

function buildWindowAroundExpectedDate(input: {
  nextExpectedDate: Date;
  recurrenceType: AnchorRecurrenceType;
  recurrenceUnit: AnchorRecurrenceUnit | null;
  reminderLeadDays: number | null | undefined;
  confidence: AnchorConfidence;
}): AnchorExpectedWindow {
  const expectedDate = new Date(input.nextExpectedDate.getTime());
  const toleranceDays = getToleranceDays(input.recurrenceType, input.recurrenceUnit);
  const defaultLeadDays = getDefaultLeadDays(input.recurrenceUnit);
  const leadDays = Math.max(toleranceDays, input.reminderLeadDays ?? defaultLeadDays);

  return {
    nextExpectedDate: expectedDate,
    expectedWindowStart: addDays(expectedDate, -leadDays),
    expectedWindowEnd: addDays(expectedDate, toleranceDays),
    confidence: input.confidence,
    reason: "KNOWN_NEXT_EXPECTED_DATE"
  };
}

function getToleranceDays(
  recurrenceType: AnchorRecurrenceType,
  recurrenceUnit: AnchorRecurrenceUnit | null
) {
  if (recurrenceType === AnchorRecurrenceType.ONE_TIME) {
    return ONE_TIME_WINDOW_DAYS;
  }

  if (!recurrenceUnit) {
    return 3;
  }

  return DEFAULT_WINDOW_DAYS_BY_UNIT[recurrenceUnit];
}

function getDefaultLeadDays(recurrenceUnit: AnchorRecurrenceUnit | null) {
  if (!recurrenceUnit) return 3;
  return DEFAULT_REMINDER_LEAD_DAYS_BY_UNIT[recurrenceUnit];
}

function normalizeInterval(value: number | null | undefined) {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.floor(value);
}

function addByUnit(date: Date, interval: number, unit: AnchorRecurrenceUnit) {
  return addDays(date, UNIT_TO_DAYS[unit] * interval);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}
