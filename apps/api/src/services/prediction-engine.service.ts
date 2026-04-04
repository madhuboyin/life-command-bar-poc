import {
  PredictionConfidenceBand,
  PredictionReferenceType,
  PredictionStatus,
  PredictionType,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import { PredictionRepository } from "../repositories/prediction.repository";
import { HomeMemoryService } from "./home-memory.service";
import { buildRecurringPredictions } from "./prediction.recurring";
import { canPromotePrediction, toPromotedObligationInput } from "./prediction.promoter";
import {
  buildPredictionRationaleSummary,
  normalizePredictionScore,
  round,
  toPredictionConfidenceBand
} from "./prediction.rationale";
import {
  buildUpcomingAttentionFromObligations,
  buildWorkloadWindowPredictions
} from "./prediction.workload";
import type { PredictionDraft } from "./prediction.types";
import { mapObligation } from "../utils/obligation.mapper";
import { AppError } from "../utils/app-error";

const confirmSchema = z.object({
  promote: z.boolean().optional()
});

const dismissSchema = z.object({
  reason: z.string().optional()
});

const patchPredictionSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  predictedDate: z.string().nullable().optional(),
  status: z
    .enum(["ACTIVE", "CONFIRMED", "DISMISSED", "EXPIRED", "PROMOTED_TO_OBLIGATION"])
    .optional(),
  confidenceScore: z.number().min(0).max(1).optional()
});

export class PredictionEngineService {
  private readonly repository = new PredictionRepository();
  private readonly homeMemoryService = new HomeMemoryService();

  async list(
    userId: string,
    query?: {
      status?: Array<"ACTIVE" | "CONFIRMED" | "DISMISSED" | "EXPIRED" | "PROMOTED_TO_OBLIGATION">;
      predictionType?: Array<
        | "RECURRING_NEXT_OCCURRENCE"
        | "UPCOMING_ATTENTION"
        | "WORKLOAD_WINDOW"
        | "MISSING_EXPECTED_OBLIGATION"
      >;
      limit?: number;
    }
  ) {
    await this.ensureFreshPredictions(userId);

    const items = await this.repository.listForUser({
      userId,
      status: (query?.status as PredictionStatus[] | undefined) ?? [PredictionStatus.ACTIVE],
      types: query?.predictionType as PredictionType[] | undefined,
      limit: query?.limit ?? 200
    });

    return {
      items: items.map((item) => this.toPredictionPayload(item))
    };
  }

  async listUpcoming(userId: string) {
    await this.ensureFreshPredictions(userId);

    const now = new Date();
    const windows = [7, 14, 30];
    const items = await this.repository.listUpcomingWindows({
      userId,
      now,
      days: windows
    });

    const payloads = items.map((item) => this.toPredictionPayload(item));

    return {
      windows: windows.map((days) => {
        const start = now;
        const end = addDays(now, days);
        const windowItems = payloads.filter((item) => {
          const predictedDate = item.predictedDate ? new Date(item.predictedDate) : null;
          const windowStart = item.predictionWindowStart
            ? new Date(item.predictionWindowStart)
            : predictedDate;
          const windowEnd = item.predictionWindowEnd
            ? new Date(item.predictionWindowEnd)
            : predictedDate;
          if (!windowStart || !windowEnd) return false;
          return windowStart <= end && windowEnd >= start;
        });

        return {
          windowDays: days,
          start: start.toISOString(),
          end: end.toISOString(),
          items: windowItems
        };
      }),
      items: payloads
    };
  }

  async getById(userId: string, id: string) {
    await this.ensureFreshPredictions(userId);

    const item = await this.repository.findByIdForUser(userId, id);
    if (!item) return null;
    return this.toPredictionPayload(item);
  }

  async rebuild(userId: string) {
    const now = new Date();
    const [patterns, openObligations, reminders] = await Promise.all([
      this.repository.listMemoryPatterns(userId),
      this.repository.listOpenObligations(userId),
      this.repository.listUpcomingReminders(userId, now, 30)
    ]);

    const recurringDrafts = buildRecurringPredictions({
      patterns: patterns.map((item) => ({
        id: item.id,
        patternType: item.patternType,
        referenceId: item.referenceId,
        patternData: item.patternData,
        confidence: Number(item.confidence),
        frequency: item.frequency,
        updatedAt: item.updatedAt
      })),
      openObligations: openObligations.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        vendor: item.vendor,
        dueDate: item.dueDate,
        status: item.status
      })),
      now
    });

    const upcomingDrafts = buildUpcomingAttentionFromObligations({
      openObligations: openObligations.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        dueDate: item.dueDate,
        urgencyScore: Number(item.urgencyScore),
        importanceScore: Number(item.importanceScore),
        confidenceScore: Number(item.confidenceScore),
        status: item.status,
        vendor: item.vendor
      })),
      now
    });

    const workloadDrafts = buildWorkloadWindowPredictions({
      openObligations: openObligations.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        dueDate: item.dueDate,
        urgencyScore: Number(item.urgencyScore),
        importanceScore: Number(item.importanceScore),
        confidenceScore: Number(item.confidenceScore),
        status: item.status,
        vendor: item.vendor
      })),
      reminders: reminders.map((item) => ({
        id: item.id,
        obligationId: item.obligationId,
        title: item.title,
        scheduledFor: item.scheduledFor,
        status: item.status
      })),
      recurringDrafts,
      now
    });

    const drafts = dedupePredictionDrafts([
      ...recurringDrafts,
      ...upcomingDrafts,
      ...workloadDrafts
    ]);

    const keepKeys: string[] = [];

    await this.repository.runInTransaction(async (tx) => {
      for (const draft of drafts) {
        const saved = await this.repository.upsertPrediction(
          {
            userId,
            predictionType: draft.predictionType,
            referenceType: draft.referenceType,
            referenceId: draft.referenceId,
            title: draft.title,
            description: draft.description,
            predictedDate: draft.predictedDate ?? null,
            predictionWindowStart: draft.predictionWindowStart ?? null,
            predictionWindowEnd: draft.predictionWindowEnd ?? null,
            confidenceScore: draft.confidenceScore,
            confidenceBand: draft.confidenceBand,
            rationale: draft.rationale,
            rationaleSummary: draft.rationaleSummary,
            status: PredictionStatus.ACTIVE
          },
          tx
        );
        keepKeys.push(buildKeepKey(saved.predictionType, saved.referenceType, saved.referenceId));
      }

      await this.repository.expireActiveNotInKeys({ userId, keepKeys }, tx);

      await this.repository.createAuditEvent(
        {
          userId,
          eventType: "prediction_rebuilt",
          metadata: {
            count: drafts.length,
            recurringCount: drafts.filter(
              (item) => item.predictionType === PredictionType.RECURRING_NEXT_OCCURRENCE
            ).length,
            upcomingCount: drafts.filter(
              (item) => item.predictionType === PredictionType.UPCOMING_ATTENTION
            ).length,
            workloadCount: drafts.filter(
              (item) => item.predictionType === PredictionType.WORKLOAD_WINDOW
            ).length,
            missingCount: drafts.filter(
              (item) => item.predictionType === PredictionType.MISSING_EXPECTED_OBLIGATION
            ).length
          }
        },
        tx
      );
    });

    return {
      rebuiltAt: now.toISOString(),
      count: drafts.length,
      summary: {
        recurringCount: drafts.filter(
          (item) => item.predictionType === PredictionType.RECURRING_NEXT_OCCURRENCE
        ).length,
        upcomingCount: drafts.filter(
          (item) => item.predictionType === PredictionType.UPCOMING_ATTENTION
        ).length,
        workloadCount: drafts.filter(
          (item) => item.predictionType === PredictionType.WORKLOAD_WINDOW
        ).length,
        missingExpectedCount: drafts.filter(
          (item) => item.predictionType === PredictionType.MISSING_EXPECTED_OBLIGATION
        ).length
      }
    };
  }

  async confirm(userId: string, predictionId: string, payload: unknown) {
    const input = confirmSchema.parse(payload ?? {});
    const prediction = await this.repository.findByIdForUser(userId, predictionId);
    if (!prediction) return null;

    const shouldPromote = input.promote ?? canPromotePrediction({
      predictionType: prediction.predictionType,
      confidenceScore: Number(prediction.confidenceScore)
    });

    if (shouldPromote && !prediction.promotedObligationId) {
      const promotedObligation = await prisma.obligation.create({
        data: toPromotedObligationInput({
          userId,
          prediction: {
            ...prediction,
            confidenceScore: Number(prediction.confidenceScore)
          }
        }),
        include: {
          importSource: {
            select: {
              id: true,
              subtype: true,
              parseStatus: true,
              parseConfidence: true,
              parserVersion: true,
              extractionSummary: true,
              rawData: true,
              createdAt: true
            }
          }
        }
      });

      const updated = await this.repository.updatePrediction(predictionId, {
        status: PredictionStatus.PROMOTED_TO_OBLIGATION,
        promotedObligationId: promotedObligation.id
      });

      await this.repository.createAuditEvent({
        userId,
        obligationId: promotedObligation.id,
        eventType: "prediction_promoted_to_obligation",
        metadata: {
          predictionId: prediction.id,
          predictionType: prediction.predictionType
        }
      });

      await this.applyPatternFeedbackFromPrediction({
        userId,
        prediction,
        outcome: "confirmed"
      });

      return {
        prediction: this.toPredictionPayload(updated),
        promotedObligation: mapObligation(promotedObligation)
      };
    }

    const updated = await this.repository.updatePrediction(predictionId, {
      status: PredictionStatus.CONFIRMED
    });

    await this.repository.createAuditEvent({
      userId,
      eventType: "prediction_confirmed",
      metadata: {
        predictionId: prediction.id,
        predictionType: prediction.predictionType
      }
    });

    await this.applyPatternFeedbackFromPrediction({
      userId,
      prediction,
      outcome: "confirmed"
    });

    return {
      prediction: this.toPredictionPayload(updated),
      promotedObligation: null
    };
  }

  async dismiss(userId: string, predictionId: string, payload: unknown) {
    const input = dismissSchema.parse(payload ?? {});
    const prediction = await this.repository.findByIdForUser(userId, predictionId);
    if (!prediction) return null;

    const nextRationale = {
      ...(asRecord(prediction.rationale) ?? {}),
      dismissedAt: new Date().toISOString(),
      dismissedReason: input.reason ?? null
    };

    const updated = await this.repository.updatePrediction(predictionId, {
      status: PredictionStatus.DISMISSED,
      rationale: nextRationale
    });

    await this.repository.createAuditEvent({
      userId,
      eventType: "prediction_dismissed",
      metadata: {
        predictionId: prediction.id,
        predictionType: prediction.predictionType,
        reason: input.reason ?? null
      }
    });

    await this.applyPatternFeedbackFromPrediction({
      userId,
      prediction,
      outcome: "dismissed"
    });

    return this.toPredictionPayload(updated);
  }

  async patch(userId: string, predictionId: string, payload: unknown) {
    const input = patchPredictionSchema.parse(payload ?? {});
    const prediction = await this.repository.findByIdForUser(userId, predictionId);
    if (!prediction) return null;

    const data: Prisma.PredictionUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.predictedDate !== undefined) {
      data.predictedDate = parseOptionalDate(input.predictedDate);
    }
    if (input.status !== undefined) {
      data.status = input.status;
    }
    if (input.confidenceScore !== undefined) {
      const score = normalizePredictionScore(input.confidenceScore);
      data.confidenceScore = score;
      data.confidenceBand = toPredictionConfidenceBand(score);
    }

    const updated = await this.repository.updatePrediction(predictionId, data);
    await this.repository.createAuditEvent({
      userId,
      obligationId: updated.promotedObligationId,
      eventType: "prediction_updated",
      metadata: {
        predictionId: updated.id,
        updatedFields: Object.keys(data)
      }
    });

    return this.toPredictionPayload(updated);
  }

  async remove(userId: string, predictionId: string) {
    const prediction = await this.repository.findByIdForUser(userId, predictionId);
    if (!prediction) return false;

    await this.repository.deletePrediction(predictionId);
    await this.repository.createAuditEvent({
      userId,
      eventType: "prediction_deleted",
      metadata: {
        predictionId
      }
    });
    return true;
  }

  async resolveWithObligation(input: {
    userId: string;
    obligationId: string;
    obligationType?: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT" | null;
    vendor?: string | null;
    dueDate?: Date | null;
  }) {
    const vendorKey = input.vendor ? normalizeKey(input.vendor) : null;
    const matches = await this.repository.listActiveMatchingObligation({
      userId: input.userId,
      vendorKey,
      obligationType: input.obligationType ?? null,
      dueDate: input.dueDate ?? null,
      limit: 10
    });
    if (matches.length === 0) return { resolvedCount: 0 };

    let resolvedCount = 0;
    for (const prediction of matches) {
      const nextStatus =
        prediction.predictionType === PredictionType.WORKLOAD_WINDOW
          ? PredictionStatus.CONFIRMED
          : PredictionStatus.PROMOTED_TO_OBLIGATION;
      await this.repository.updatePrediction(prediction.id, {
        status: nextStatus,
        promotedObligationId:
          nextStatus === PredictionStatus.PROMOTED_TO_OBLIGATION ? input.obligationId : null
      });

      await this.repository.createAuditEvent({
        userId: input.userId,
        obligationId: input.obligationId,
        eventType: "prediction_resolved_by_ingestion",
        metadata: {
          predictionId: prediction.id,
          predictionType: prediction.predictionType
        }
      });

      await this.applyPatternFeedbackFromPrediction({
        userId: input.userId,
        prediction,
        outcome: "confirmed"
      });
      resolvedCount += 1;
    }

    return { resolvedCount };
  }

  async getPreparationItems(userId: string, options?: { days?: number; limit?: number }) {
    await this.ensureFreshPredictions(userId);

    const now = new Date();
    const days = options?.days ?? 7;
    const limit = options?.limit ?? 3;
    const window = await this.repository.listUpcomingWindows({
      userId,
      now,
      days: [days]
    });

    const filtered = window
      .filter((item) => {
        if (item.status !== PredictionStatus.ACTIVE) return false;
        if (
          item.predictionType !== PredictionType.UPCOMING_ATTENTION &&
          item.predictionType !== PredictionType.MISSING_EXPECTED_OBLIGATION &&
          item.predictionType !== PredictionType.RECURRING_NEXT_OCCURRENCE
        ) {
          return false;
        }
        return item.confidenceBand !== PredictionConfidenceBand.LOW;
      })
      .slice(0, limit);

    return filtered.map((item) => this.toPredictionPayload(item));
  }

  async getBoostForObligationIds(userId: string, obligationIds: string[]) {
    await this.ensureFreshPredictions(userId);

    const items = await this.repository.listActiveForObligationIds(userId, obligationIds);
    const boosts = new Map<string, number>();

    for (const item of items) {
      const daysUntil = item.predictedDate ? diffDays(item.predictedDate, new Date()) : 30;
      let boost = Number(item.confidenceScore) >= 0.78 ? 8 : Number(item.confidenceScore) >= 0.48 ? 5 : 2;
      if (daysUntil <= 7) boost += 4;
      if (daysUntil <= 3) boost += 2;
      boosts.set(item.referenceId, Math.max(boosts.get(item.referenceId) ?? 0, boost));
    }

    return boosts;
  }

  private async applyPatternFeedbackFromPrediction(input: {
    userId: string;
    prediction: {
      referenceType: PredictionReferenceType;
      referenceId: string;
      confidenceScore: Prisma.Decimal | number;
      rationale: Prisma.JsonValue | null;
      predictionType: PredictionType;
    };
    outcome: "confirmed" | "dismissed";
  }) {
    if (input.prediction.referenceType !== PredictionReferenceType.MEMORY_PATTERN) {
      return;
    }
    const patternId = input.prediction.referenceId.startsWith("attention:")
      ? input.prediction.referenceId.replace("attention:", "")
      : input.prediction.referenceId;
    const delta = input.outcome === "confirmed" ? 0.06 : -0.12;
    const current = Number(input.prediction.confidenceScore);
    const nextConfidence = Math.max(0.2, Math.min(0.98, current + delta));

    await this.homeMemoryService
      .updatePattern(input.userId, patternId, {
        confidence: round(nextConfidence, 4),
        isSuppressed: input.outcome === "dismissed" && nextConfidence < 0.35 ? true : undefined
      })
      .catch(() => null);

    await this.homeMemoryService
      .captureSignal({
        userId: input.userId,
        sourceType: "FEEDBACK",
        referenceId: patternId,
        eventType:
          input.outcome === "confirmed"
            ? "prediction_pattern_confirmed"
            : "prediction_pattern_dismissed",
        metadata: {
          predictionType: input.prediction.predictionType,
          confidenceBefore: current,
          confidenceAfter: nextConfidence
        },
        rebuild: true
      })
      .catch(() => null);
  }

  private async ensureFreshPredictions(userId: string) {
    const freshness = await this.repository.getFreshness(userId);
    const predictionAt = freshness.latestPredictionAt;

    if (!predictionAt) {
      await this.rebuild(userId);
      return;
    }

    const isSourceNewer =
      (freshness.latestMemoryEventAt?.getTime() ?? 0) > predictionAt.getTime() ||
      (freshness.latestObligationAt?.getTime() ?? 0) > predictionAt.getTime() ||
      (freshness.latestReminderAt?.getTime() ?? 0) > predictionAt.getTime();

    if (isSourceNewer) {
      await this.rebuild(userId);
      return;
    }

    if (Date.now() - predictionAt.getTime() > 12 * 60 * 60 * 1000) {
      await this.rebuild(userId);
    }
  }

  private toPredictionPayload(item: {
    id: string;
    predictionType: PredictionType;
    referenceType: PredictionReferenceType;
    referenceId: string;
    title: string;
    description: string | null;
    predictedDate: Date | null;
    predictionWindowStart: Date | null;
    predictionWindowEnd: Date | null;
    confidenceScore: Prisma.Decimal | number;
    confidenceBand: PredictionConfidenceBand;
    status: PredictionStatus;
    rationale: Prisma.JsonValue | null;
    rationaleSummary: string | null;
    promotedObligationId: string | null;
    promotedObligation?: unknown;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const rationale = asRecord(item.rationale);
    return {
      id: item.id,
      predictionType: item.predictionType,
      referenceType: item.referenceType,
      referenceId: item.referenceId,
      title: item.title,
      description: item.description,
      predictedDate: item.predictedDate?.toISOString() ?? null,
      predictionWindowStart: item.predictionWindowStart?.toISOString() ?? null,
      predictionWindowEnd: item.predictionWindowEnd?.toISOString() ?? null,
      confidenceScore: Number(item.confidenceScore),
      confidenceBand: item.confidenceBand,
      status: item.status,
      rationale: item.rationale,
      rationaleSummary: item.rationaleSummary ?? buildPredictionRationaleSummary(item.rationale),
      sourceReference: {
        referenceType: item.referenceType,
        referenceId: item.referenceId,
        matchedVendor: toStringOrNull(rationale?.matchedVendor) ?? toStringOrNull(rationale?.vendor),
        obligationType: toStringOrNull(rationale?.obligationType)
      },
      promotedObligationId: item.promotedObligationId,
      promotedObligation:
        item.promotedObligation && typeof item.promotedObligation === "object"
          ? mapObligation(item.promotedObligation as never)
          : null,
      needsConfirmation:
        item.status === PredictionStatus.ACTIVE &&
        item.confidenceBand !== PredictionConfidenceBand.HIGH,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  }
}

function dedupePredictionDrafts(items: PredictionDraft[]) {
  const map = new Map<string, PredictionDraft>();
  for (const item of items) {
    const key = buildKeepKey(item.predictionType, item.referenceType, item.referenceId);
    const existing = map.get(key);
    if (!existing || item.confidenceScore > existing.confidenceScore) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function buildKeepKey(
  predictionType: PredictionType,
  referenceType: PredictionReferenceType,
  referenceId: string
) {
  return `${predictionType}|${referenceType}|${referenceId}`;
}

function parseOptionalDate(value: string | null) {
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid predictedDate", 400, {
      predictedDate: value
    });
  }
  return parsed;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function diffDays(left: Date, right: Date) {
  return (left.getTime() - right.getTime()) / (1000 * 60 * 60 * 24);
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
