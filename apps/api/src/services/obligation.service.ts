import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import { ObligationRepository } from "../repositories/obligation.repository";
import { ObligationSort, ObligationView, SortDirection } from "../types/obligation.types";
import { mapObligation } from "../utils/obligation.mapper";
import { AppError } from "../utils/app-error";

const createObligationSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(["BILL", "SUBSCRIPTION", "RENEWAL", "COMMITMENT"]),
  title: z.string().min(1),
  description: z.string().optional(),
  vendor: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().length(3).optional(),
  dueDate: z.string().datetime().optional(),
  recurrence: z.string().optional(),
  source: z.enum(["MANUAL", "EMAIL", "DOCUMENT", "INFERRED"]).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  urgencyScore: z.number().min(0).max(100).optional(),
  importanceScore: z.number().min(0).max(100).optional(),
  effortLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  impactLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "POSTPONED", "RESOLVED", "IGNORED"]).optional()
});

const updateObligationSchema = z.object({
  type: z.enum(["BILL", "SUBSCRIPTION", "RENEWAL", "COMMITMENT"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  recurrence: z.string().nullable().optional(),
  source: z.enum(["MANUAL", "EMAIL", "DOCUMENT", "INFERRED"]).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  urgencyScore: z.number().min(0).max(100).optional(),
  importanceScore: z.number().min(0).max(100).optional(),
  effortLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  impactLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "POSTPONED", "RESOLVED", "IGNORED"]).optional()
});

const correctionSchema = z.object({
  correctedFields: z
    .object({
      type: z.enum(["BILL", "SUBSCRIPTION", "RENEWAL", "COMMITMENT"]).optional(),
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      vendor: z.string().nullable().optional(),
      amount: z.number().nullable().optional(),
      currency: z.string().length(3).nullable().optional(),
      dueDate: z.string().nullable().optional(),
      recurrence: z.string().nullable().optional()
    })
    .optional(),
  reason: z.string().min(1).optional(),
  dismissPermanently: z.boolean().optional(),
  dontShowSimilar: z.boolean().optional()
});

export class ObligationService {
  private readonly repository = new ObligationRepository();

  async list(userId: string, query: Record<string, unknown>) {
    const limit = parseIntegerQuery(query.limit, 20, 1, 100);
    const offset = parseIntegerQuery(query.offset, 0, 0, 10000);
    const view = parseEnumQuery<ObligationView>(query.view, supportedViews);
    const sort = parseEnumQuery<ObligationSort>(query.sort, supportedSorts);
    const direction = parseEnumQuery<SortDirection>(query.direction, supportedDirections);

    const result = await this.repository.findMany({
      userId,
      status: typeof query.status === "string" ? query.status : undefined,
      type: typeof query.type === "string" ? query.type : undefined,
      view,
      sort,
      direction,
      limit,
      offset
    });

    return {
      items: result.items.map(mapObligation),
      pagination: {
        limit: result.limit,
        offset: result.offset,
        total: result.total
      },
      appliedView: result.appliedView
    };
  }

  async getById(userId: string, id: string) {
    const obligation = await this.repository.findById(id, userId);
    if (!obligation) return null;
    return mapObligation(obligation);
  }

  async create(payload: unknown) {
    const input = createObligationSchema.parse(payload);
    const obligation = await this.repository.create(input);
    return mapObligation(obligation);
  }

  async update(userId: string, id: string, payload: unknown) {
    const input = updateObligationSchema.parse(payload);
    const obligation = await this.repository.update(id, userId, input);
    if (!obligation) return null;
    return mapObligation(obligation);
  }

  async getHistory(userId: string, id: string) {
    const obligation = await this.repository.findById(id, userId);
    if (!obligation) return null;

    const history = await this.repository.getHistory(id, userId);

    return {
      auditEvents: history.auditEvents.map((item) => ({
        id: item.id,
        eventType: item.eventType,
        metadata: item.metadata,
        createdAt: item.createdAt.toISOString()
      })),
      feedbackEvents: history.feedbackEvents.map((item) => ({
        id: item.id,
        type: item.type,
        note: item.note,
        createdAt: item.createdAt.toISOString()
      })),
      resolutionRuns: history.resolutionRuns.map((item) => ({
        id: item.id,
        flowKey: item.flowKey,
        recommendedOption: item.recommendedOption,
        confidence: item.confidence,
        createdAt: item.createdAt.toISOString()
      })),
      reminders: history.reminders.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        scheduledFor: item.scheduledFor.toISOString(),
        createdAt: item.createdAt.toISOString()
      })),
      guidedJourneyEvents: history.guidedJourneyEvents.map((item) => ({
        id: item.id,
        journeyId: item.journeyId,
        eventType: item.eventType,
        metadata: item.metadata,
        createdAt: item.createdAt.toISOString()
      })),
      guidedJourneys: history.guidedJourneys.map((item) => ({
        id: item.id,
        journeyType: item.journeyType,
        status: item.status,
        currentStepIndex: item.currentStepIndex,
        totalSteps: item.steps.length,
        completedSteps: item.steps.filter((step) => step.isCompleted).length,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        completedAt: item.completedAt?.toISOString() ?? null
      })),
      outcomeFeedbackEvents: history.outcomeFeedbackEvents.map((item) => ({
        id: item.id,
        sourceContext: item.sourceContext,
        recommendationKey: item.recommendationKey,
        selectedActionKey: item.selectedActionKey,
        outcomeType: item.outcomeType,
        note: item.note,
        createdAt: item.createdAt.toISOString()
      }))
    };
  }

  async correct(userId: string, id: string, payload: unknown) {
    const input = correctionSchema.parse(payload ?? {});
    const existing = await this.repository.findById(id, userId);
    if (!existing) return null;

    const correctedFields = input.correctedFields ?? {};
    const updatePayload: Record<string, unknown> = {};

    if (correctedFields.type !== undefined) updatePayload.type = correctedFields.type;
    if (correctedFields.title !== undefined) updatePayload.title = correctedFields.title;
    if (correctedFields.description !== undefined) {
      updatePayload.description = correctedFields.description;
    }
    if (correctedFields.vendor !== undefined) updatePayload.vendor = correctedFields.vendor;
    if (correctedFields.amount !== undefined) updatePayload.amount = correctedFields.amount;
    if (correctedFields.currency !== undefined) {
      updatePayload.currency = correctedFields.currency?.toUpperCase() ?? null;
    }
    if (correctedFields.dueDate !== undefined) {
      updatePayload.dueDate = normalizeDueDateValue(correctedFields.dueDate);
    }
    if (correctedFields.recurrence !== undefined) {
      updatePayload.recurrence = correctedFields.recurrence;
    }

    if (input.dismissPermanently) {
      updatePayload.status = "IGNORED";
    }

    const hasFieldChanges = Object.keys(updatePayload).length > 0;
    const corrected = hasFieldChanges
      ? await this.repository.update(id, userId, updatePayload)
      : existing;

    if (!corrected) {
      return null;
    }

    await prisma.auditEvent.create({
      data: {
        userId,
        obligationId: id,
        eventType: "obligation_corrected",
        metadata: {
          correctedFields: Object.keys(updatePayload),
          reason: input.reason ?? null,
          dismissPermanently: Boolean(input.dismissPermanently),
          dontShowSimilar: Boolean(input.dontShowSimilar)
        }
      }
    });

    await prisma.feedbackEvent.create({
      data: {
        userId,
        obligationId: id,
        type: "WRONG_INFO",
        note: input.reason ?? "User corrected obligation fields."
      }
    });

    if (input.dontShowSimilar) {
      await prisma.feedbackEvent.create({
        data: {
          userId,
          obligationId: id,
          type: "DONT_SHOW_AGAIN",
          note: "User requested to avoid similar suggestions."
        }
      });
    }

    return mapObligation(corrected);
  }

  async getReviewQueue(userId: string, query: Record<string, unknown>) {
    const limit = parseIntegerQuery(query.limit, 50, 1, 200);
    const items = await this.repository.findReviewQueueCandidates(userId, limit);
    const mapped = items.map((item) => mapObligation(item));

    const reviewItems = mapped
      .filter((item) => item.needsReview || item.conflictDetected || item.duplicateCandidate)
      .map((item) => ({
        ...item,
        reviewReasons: buildReviewReasons(item)
      }));

    return {
      items: reviewItems,
      pagination: {
        limit,
        total: reviewItems.length
      }
    };
  }
}

const supportedViews: ObligationView[] = [
  "urgent",
  "quick_wins",
  "money",
  "renewals",
  "subscriptions",
  "bills",
  "postponed_recently",
  "resolved_recently",
  "active_now",
  "commitments"
];

const supportedSorts: ObligationSort[] = [
  "due_date",
  "importance",
  "urgency",
  "created_at",
  "amount"
];

const supportedDirections: SortDirection[] = ["asc", "desc"];

function parseIntegerQuery(
  value: unknown,
  fallback: number,
  minValue: number,
  maxValue: number
) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  const rounded = Math.floor(parsed);
  if (rounded < minValue) return minValue;
  if (rounded > maxValue) return maxValue;
  return rounded;
}

function parseEnumQuery<T extends string>(value: unknown, options: T[]): T | undefined {
  if (typeof value !== "string") return undefined;
  return options.includes(value as T) ? (value as T) : undefined;
}

function normalizeDueDateValue(value: string | null) {
  if (value === null || value.trim() === "") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid dueDate", 400, {
      dueDate: value
    });
  }

  return date.toISOString();
}

function buildReviewReasons(item: {
  confidenceBand?: string;
  conflictDetected?: boolean;
  duplicateCandidate?: boolean;
  extractionStatus?: string | null;
}) {
  const reasons: string[] = [];

  if (item.conflictDetected) reasons.push("Conflicting source data detected");
  if (item.duplicateCandidate) reasons.push("Possible duplicate item");
  if (item.confidenceBand === "LOW") reasons.push("Low confidence - needs confirmation");
  if (item.confidenceBand === "MEDIUM") reasons.push("Medium confidence - review suggested");
  if (item.extractionStatus === "PARTIAL") reasons.push("Partial extraction");
  if (item.extractionStatus === "FAILED") reasons.push("Extraction failed");

  if (reasons.length === 0) {
    reasons.push("Draft item needs quick review");
  }

  return reasons;
}
