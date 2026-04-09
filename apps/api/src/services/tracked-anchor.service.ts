import {
  AnchorCategory,
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorSource,
  AnchorStatus
} from "@prisma/client";
import { z } from "zod";
import { TrackedAnchorRepository } from "../repositories/tracked-anchor.repository";
import type {
  AnchorDueEvaluation,
  CreateTrackedAnchorInput,
  UpdateTrackedAnchorInput
} from "../types/anchor-tracking.types";
import { AnchorTrackingEngineService } from "./anchor-tracking-engine.service";

const createTrackedAnchorSchema = z.object({
  label: z.string().trim().min(1),
  normalizedLabel: z.string().trim().min(1).nullable().optional(),
  category: z.nativeEnum(AnchorCategory),
  recurrenceType: z.nativeEnum(AnchorRecurrenceType).optional(),
  recurrenceInterval: z.number().int().positive().nullable().optional(),
  recurrenceUnit: z.nativeEnum(AnchorRecurrenceUnit).nullable().optional(),
  expectedAmount: z.number().nonnegative().nullable().optional(),
  currencyCode: z.string().trim().length(3).nullable().optional(),
  nextExpectedDate: z.string().datetime().nullable().optional(),
  reminderLeadDays: z.number().int().min(0).max(180).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.nativeEnum(AnchorSource).optional(),
  confidence: z.nativeEnum(AnchorConfidence).optional(),
  vendorId: z.string().trim().min(1).nullable().optional(),
  linkedObligationId: z.string().trim().min(1).nullable().optional()
});

const updateTrackedAnchorSchema = z.object({
  label: z.string().trim().min(1).optional(),
  normalizedLabel: z.string().trim().min(1).nullable().optional(),
  category: z.nativeEnum(AnchorCategory).optional(),
  recurrenceType: z.nativeEnum(AnchorRecurrenceType).optional(),
  recurrenceInterval: z.number().int().positive().nullable().optional(),
  recurrenceUnit: z.nativeEnum(AnchorRecurrenceUnit).nullable().optional(),
  expectedAmount: z.number().nonnegative().nullable().optional(),
  currencyCode: z.string().trim().length(3).nullable().optional(),
  nextExpectedDate: z.string().datetime().nullable().optional(),
  expectedWindowStart: z.string().datetime().nullable().optional(),
  expectedWindowEnd: z.string().datetime().nullable().optional(),
  status: z.nativeEnum(AnchorStatus).optional(),
  source: z.nativeEnum(AnchorSource).optional(),
  confidence: z.nativeEnum(AnchorConfidence).optional(),
  reminderLeadDays: z.number().int().min(0).max(180).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  vendorId: z.string().trim().min(1).nullable().optional(),
  linkedObligationId: z.string().trim().min(1).nullable().optional(),
  lastSnoozedUntil: z.string().datetime().nullable().optional()
});

type TrackedAnchorServiceDependencies = {
  repository?: TrackedAnchorRepository;
  trackingEngine?: AnchorTrackingEngineService;
  now?: () => Date;
};

export class TrackedAnchorService {
  private readonly repository: TrackedAnchorRepository;
  private readonly trackingEngine: AnchorTrackingEngineService;
  private readonly now: () => Date;

  constructor(dependencies: TrackedAnchorServiceDependencies = {}) {
    this.repository = dependencies.repository ?? new TrackedAnchorRepository();
    this.trackingEngine =
      dependencies.trackingEngine ?? new AnchorTrackingEngineService();
    this.now = dependencies.now ?? (() => new Date());
  }

  async createAnchor(userId: string, payload: unknown) {
    const parsed = createTrackedAnchorSchema.parse(payload);
    const input = normalizeCreateInput(parsed);
    const recurrence = this.trackingEngine.normalizeRecurrenceDefinition({
      recurrenceType: input.recurrenceType,
      recurrenceInterval: input.recurrenceInterval,
      recurrenceUnit: input.recurrenceUnit
    });

    const timing = this.trackingEngine.computeInitialExpectedWindow(
      {
        recurrenceType: recurrence.recurrenceType,
        recurrenceInterval: recurrence.recurrenceInterval,
        recurrenceUnit: recurrence.recurrenceUnit,
        nextExpectedDate: asDateOrNull(input.nextExpectedDate),
        reminderLeadDays: input.reminderLeadDays,
        confidence: input.confidence
      },
      this.now()
    );

    return this.repository.createAnchor(userId, {
      ...input,
      recurrenceType: recurrence.recurrenceType,
      recurrenceInterval: recurrence.recurrenceInterval,
      recurrenceUnit: recurrence.recurrenceUnit,
      nextExpectedDate: timing.nextExpectedDate,
      expectedWindowStart: timing.expectedWindowStart,
      expectedWindowEnd: timing.expectedWindowEnd,
      confidence: timing.confidence
    });
  }

  async getAnchorForUser(anchorId: string, userId: string) {
    return this.repository.getByUserId(anchorId, userId);
  }

  async listForUser(userId: string) {
    return this.repository.listForUser(userId);
  }

  async listActiveForUser(userId: string) {
    return this.repository.listActiveForUser(userId);
  }

  async updateAnchor(userId: string, anchorId: string, payload: unknown) {
    const parsed = updateTrackedAnchorSchema.parse(payload);
    const patch = normalizeUpdateInput(parsed);
    if (hasOwn(parsed, "label") && !hasOwn(parsed, "normalizedLabel") && parsed.label) {
      patch.normalizedLabel = normalizeLabel(parsed.label);
    }

    const existing = await this.repository.getByUserId(anchorId, userId);
    if (!existing) return null;

    const nextPatch: UpdateTrackedAnchorInput = { ...patch };
    if (shouldRecomputeTiming(parsed)) {
      const recurrence = this.trackingEngine.normalizeRecurrenceDefinition({
        recurrenceType: hasOwn(parsed, "recurrenceType")
          ? patch.recurrenceType
          : existing.recurrenceType,
        recurrenceInterval: hasOwn(parsed, "recurrenceInterval")
          ? patch.recurrenceInterval
          : existing.recurrenceInterval,
        recurrenceUnit: hasOwn(parsed, "recurrenceUnit")
          ? patch.recurrenceUnit
          : existing.recurrenceUnit
      });

      const timing = this.trackingEngine.computeExpectedWindow(
        {
          recurrenceType: recurrence.recurrenceType,
          recurrenceInterval: recurrence.recurrenceInterval,
          recurrenceUnit: recurrence.recurrenceUnit,
          nextExpectedDate: resolveDateForTiming(
            parsed,
            "nextExpectedDate",
            patch.nextExpectedDate,
            existing.nextExpectedDate
          ),
          expectedWindowStart:
            resolveDateForTiming(
              parsed,
              "expectedWindowStart",
              patch.expectedWindowStart,
              existing.expectedWindowStart
            ),
          expectedWindowEnd:
            resolveDateForTiming(
              parsed,
              "expectedWindowEnd",
              patch.expectedWindowEnd,
              existing.expectedWindowEnd
            ),
          reminderLeadDays: hasOwn(parsed, "reminderLeadDays")
            ? (patch.reminderLeadDays ?? null)
            : existing.reminderLeadDays,
          lastSnoozedUntil: existing.lastSnoozedUntil,
          status: patch.status ?? existing.status,
          confidence: patch.confidence ?? existing.confidence
        },
        this.now()
      );

      nextPatch.nextExpectedDate = timing.nextExpectedDate;
      if (!hasOwn(parsed, "expectedWindowStart")) {
        nextPatch.expectedWindowStart = timing.expectedWindowStart;
      }
      if (!hasOwn(parsed, "expectedWindowEnd")) {
        nextPatch.expectedWindowEnd = timing.expectedWindowEnd;
      }
      if (!hasOwn(parsed, "confidence")) {
        nextPatch.confidence = timing.confidence;
      }
    }

    return this.repository.updateAnchor(anchorId, userId, nextPatch);
  }

  async pauseAnchor(anchorId: string, userId: string) {
    return this.repository.pauseAnchor(anchorId, userId);
  }

  async cancelAnchor(anchorId: string, userId: string) {
    return this.repository.cancelAnchor(anchorId, userId);
  }

  async archiveAnchor(anchorId: string, userId: string) {
    return this.repository.archiveAnchor(anchorId, userId);
  }

  async markConfirmed(anchorId: string, userId: string, timestamp?: Date) {
    return this.repository.markConfirmed(anchorId, userId, timestamp ?? this.now());
  }

  async markObserved(anchorId: string, userId: string, timestamp?: Date) {
    return this.repository.markObserved(anchorId, userId, timestamp ?? this.now());
  }

  async markSurfaced(anchorId: string, userId: string, timestamp?: Date) {
    return this.repository.markSurfaced(anchorId, userId, timestamp ?? this.now());
  }

  async snoozeAnchor(anchorId: string, userId: string, until: Date | string) {
    return this.repository.snoozeAnchor(anchorId, userId, until);
  }

  async evaluateDueStatus(anchorId: string, userId: string, now = this.now()) {
    const anchor = await this.repository.getByUserId(anchorId, userId);
    if (!anchor) return null;

    const evaluation = this.trackingEngine.evaluateAnchorDueStatus(
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

    return {
      anchor,
      evaluation
    };
  }

  async advanceAnchorCycle(anchorId: string, userId: string, referenceDate?: Date) {
    const anchor = await this.repository.getByUserId(anchorId, userId);
    if (!anchor) return null;

    const advancement = this.trackingEngine.advanceAnchorToNextCycle(
      {
        recurrenceType: anchor.recurrenceType,
        recurrenceInterval: anchor.recurrenceInterval,
        recurrenceUnit: anchor.recurrenceUnit,
        nextExpectedDate: anchor.nextExpectedDate,
        reminderLeadDays: anchor.reminderLeadDays,
        confidence: anchor.confidence
      },
      referenceDate
    );

    if (!advancement.advanced) {
      return {
        anchor,
        advancement
      };
    }

    const updated = await this.repository.updateAnchor(anchorId, userId, {
      nextExpectedDate: advancement.nextExpectedDate,
      expectedWindowStart: advancement.expectedWindowStart,
      expectedWindowEnd: advancement.expectedWindowEnd
    });

    return {
      anchor: updated,
      advancement
    };
  }

  computeDueStatusForAnchor(
    input: {
      recurrenceType: AnchorRecurrenceType;
      recurrenceInterval: number | null;
      recurrenceUnit: AnchorRecurrenceUnit | null;
      nextExpectedDate: Date | null;
      expectedWindowStart: Date | null;
      expectedWindowEnd: Date | null;
      reminderLeadDays: number | null;
      lastSnoozedUntil: Date | null;
      status: AnchorStatus;
      confidence: AnchorConfidence;
    },
    now = this.now()
  ): AnchorDueEvaluation {
    return this.trackingEngine.evaluateAnchorDueStatus(input, now);
  }
}

function normalizeCreateInput(
  input: z.infer<typeof createTrackedAnchorSchema>
): CreateTrackedAnchorInput {
  return {
    label: input.label.trim(),
    normalizedLabel: input.normalizedLabel ?? normalizeLabel(input.label),
    category: input.category,
    recurrenceType: input.recurrenceType ?? AnchorRecurrenceType.UNKNOWN,
    recurrenceInterval: input.recurrenceInterval ?? null,
    recurrenceUnit: input.recurrenceUnit ?? null,
    expectedAmount: input.expectedAmount ?? null,
    currencyCode: normalizeCurrencyCode(input.currencyCode),
    nextExpectedDate: input.nextExpectedDate ?? null,
    reminderLeadDays: input.reminderLeadDays ?? null,
    notes: input.notes ?? null,
    source: input.source ?? AnchorSource.USER_ADDED,
    confidence: input.confidence ?? AnchorConfidence.USER_PROVIDED,
    vendorId: input.vendorId ?? null,
    linkedObligationId: input.linkedObligationId ?? null
  };
}

function normalizeUpdateInput(
  input: z.infer<typeof updateTrackedAnchorSchema>
): UpdateTrackedAnchorInput {
  return {
    label: input.label?.trim(),
    normalizedLabel: input.normalizedLabel,
    category: input.category,
    recurrenceType: input.recurrenceType,
    recurrenceInterval: input.recurrenceInterval,
    recurrenceUnit: input.recurrenceUnit,
    expectedAmount: input.expectedAmount,
    currencyCode: normalizeCurrencyCode(input.currencyCode),
    nextExpectedDate: input.nextExpectedDate,
    expectedWindowStart: input.expectedWindowStart,
    expectedWindowEnd: input.expectedWindowEnd,
    status: input.status,
    source: input.source,
    confidence: input.confidence,
    reminderLeadDays: input.reminderLeadDays,
    notes: input.notes,
    vendorId: input.vendorId,
    linkedObligationId: input.linkedObligationId,
    lastSnoozedUntil: input.lastSnoozedUntil
  };
}

function normalizeLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCurrencyCode(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value.toUpperCase();
}

function asDateOrNull(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

function asDateOrUndefined(value: string | Date | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

function shouldRecomputeTiming(input: z.infer<typeof updateTrackedAnchorSchema>) {
  return (
    hasOwn(input, "nextExpectedDate") ||
    hasOwn(input, "recurrenceType") ||
    hasOwn(input, "recurrenceInterval") ||
    hasOwn(input, "recurrenceUnit") ||
    hasOwn(input, "reminderLeadDays")
  );
}

function resolveDateForTiming(
  input: z.infer<typeof updateTrackedAnchorSchema>,
  key: keyof z.infer<typeof updateTrackedAnchorSchema>,
  patchValue: string | Date | null | undefined,
  existingValue: Date | null
) {
  if (!hasOwn(input, key)) return existingValue;
  const parsed = asDateOrUndefined(patchValue);
  return parsed === undefined ? existingValue : parsed;
}

function hasOwn<T extends object>(input: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(input, key);
}
