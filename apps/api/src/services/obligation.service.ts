import { AutoFlowTriggerType, ObligationStatus, ScopeType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { ObligationRepository } from "../repositories/obligation.repository";
import { ObligationSort, ObligationView, SortDirection } from "../types/obligation.types";
import { mapObligation } from "../utils/obligation.mapper";
import { AppError } from "../utils/app-error";
import {
  ensureAssigneeIsActiveMember,
  requireHouseholdMember
} from "../utils/household-access";
import { AutoFlowService } from "./auto-flow.service";
import { HomeMemoryService } from "./home-memory.service";
import { PredictionEngineService } from "./prediction-engine.service";

const createObligationSchema = z.object({
  userId: z.string().min(1),
  scopeType: z.enum(["PERSONAL", "HOUSEHOLD"]).optional(),
  householdId: z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
  lastHandledByUserId: z.string().nullable().optional(),
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
  scopeType: z.enum(["PERSONAL", "HOUSEHOLD"]).optional(),
  householdId: z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
  lastHandledByUserId: z.string().nullable().optional(),
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

const assignSchema = z.object({
  assignedToUserId: z.string().min(1)
});

const handOffSchema = z.object({
  toUserId: z.string().min(1)
});

const patchScopeSchema = z.object({
  scopeType: z.enum(["PERSONAL", "HOUSEHOLD"]),
  householdId: z.string().nullable().optional()
});

export class ObligationService {
  private readonly repository = new ObligationRepository();
  private readonly autoFlowService = new AutoFlowService();
  private readonly homeMemoryService = new HomeMemoryService();
  private readonly predictionEngineService = new PredictionEngineService();

  async list(userId: string, query: Record<string, unknown>) {
    const limit = parseIntegerQuery(query.limit, 20, 1, 100);
    const offset = parseIntegerQuery(query.offset, 0, 0, 10000);
    const view = parseEnumQuery<ObligationView>(query.view, supportedViews);
    const sort = parseEnumQuery<ObligationSort>(query.sort, supportedSorts);
    const direction = parseEnumQuery<SortDirection>(query.direction, supportedDirections);
    const scopeType = parseEnumQuery<"PERSONAL" | "HOUSEHOLD">(
      query.scopeType,
      ["PERSONAL", "HOUSEHOLD"]
    );
    const householdId = typeof query.householdId === "string" ? query.householdId : undefined;

    if (householdId) {
      await requireHouseholdMember(householdId, userId);
    }

    const result = await this.repository.findMany({
      userId,
      status: typeof query.status === "string" ? query.status : undefined,
      type: typeof query.type === "string" ? query.type : undefined,
      view,
      scopeType,
      householdId,
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
    const scopeType = input.scopeType ?? (input.householdId ? "HOUSEHOLD" : "PERSONAL");

    if (scopeType === "HOUSEHOLD") {
      const householdId = input.householdId;
      if (!householdId) {
        throw new AppError("VALIDATION_ERROR", "householdId is required for household scope", 400);
      }
      await requireHouseholdMember(householdId, input.userId);
      if (input.assignedToUserId) {
        await ensureAssigneeIsActiveMember(householdId, input.assignedToUserId);
      }
    }

    const obligation = await this.repository.create(input);
    const mapped = mapObligation(obligation);

    await this.autoFlowService.triggerForEvent({
      userId: mapped.userId,
      obligationId: mapped.id,
      triggerType: AutoFlowTriggerType.URGENCY_TRIGGER,
      source: "manual_create",
      reasonHint: "New obligation may be ready to act"
    });

    await this.captureMemorySignal({
      userId: mapped.userId,
      referenceId: mapped.id,
      eventType: "obligation_created"
    });

    await this.predictionEngineService
      .resolveWithObligation({
        userId: mapped.userId,
        obligationId: mapped.id,
        obligationType: mapped.type,
        vendor: mapped.vendor,
        dueDate: mapped.dueDate ? new Date(mapped.dueDate) : null
      })
      .catch(() => null);

    return mapped;
  }

  async update(userId: string, id: string, payload: unknown) {
    const input = updateObligationSchema.parse(payload);
    const existing = await this.repository.findById(id, userId);
    if (!existing) return null;

    const nextScopeType = input.scopeType ?? existing.scopeType;
    const nextHouseholdId =
      nextScopeType === ScopeType.HOUSEHOLD
        ? input.householdId === undefined
          ? existing.householdId
          : input.householdId
        : null;

    if (nextScopeType === ScopeType.HOUSEHOLD) {
      if (!nextHouseholdId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "householdId is required when scope is HOUSEHOLD",
          400
        );
      }
      await requireHouseholdMember(nextHouseholdId, userId);
      const nextAssignee =
        input.assignedToUserId === undefined ? existing.assignedToUserId : input.assignedToUserId;
      if (nextAssignee) {
        await ensureAssigneeIsActiveMember(nextHouseholdId, nextAssignee);
      }
    }

    const obligation = await this.repository.update(id, userId, input);
    if (!obligation) return null;

    const mapped = mapObligation(obligation);
    const changedUrgencySignal =
      input.dueDate !== undefined ||
      input.urgencyScore !== undefined ||
      input.importanceScore !== undefined ||
      input.status !== undefined;

    if (changedUrgencySignal) {
      if (mapped.status === ObligationStatus.ACTIVE || mapped.status === ObligationStatus.DRAFT) {
        await this.autoFlowService.triggerForEvent({
          userId,
          obligationId: mapped.id,
          triggerType: AutoFlowTriggerType.URGENCY_TRIGGER,
          source: "obligation_update",
          reasonHint: "Updated details changed urgency"
        });
      } else {
        await this.autoFlowService.handleObligationStatusChange(userId, mapped.id, mapped.status);
      }
    }

    await this.captureMemorySignal({
      userId,
      referenceId: mapped.id,
      eventType: "obligation_updated",
      metadata: {
        updatedFields: Object.keys(input)
      }
    });

    await this.predictionEngineService
      .resolveWithObligation({
        userId,
        obligationId: mapped.id,
        obligationType: mapped.type,
        vendor: mapped.vendor,
        dueDate: mapped.dueDate ? new Date(mapped.dueDate) : null
      })
      .catch(() => null);

    return mapped;
  }

  async getHistory(userId: string, id: string) {
    const obligation = await this.repository.findById(id, userId);
    if (!obligation) return null;

    const history = await this.repository.getHistory(id, userId);
    if (!history) return null;

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
      })),
      autonomyDecisions: history.autonomyDecisions.map((item) => ({
        id: item.id,
        candidateAction: item.candidateAction,
        decision: item.decision,
        approvalStatus: item.approvalStatus,
        title: item.title,
        description: item.description,
        confidenceScore: Number(item.confidenceScore),
        createdAt: item.createdAt.toISOString(),
        executedAt: item.executedAt?.toISOString() ?? null,
        approvedAt: item.approvedAt?.toISOString() ?? null,
        rejectedAt: item.rejectedAt?.toISOString() ?? null,
        undoneAt: item.undoneAt?.toISOString() ?? null,
        undoReason: item.undoReason
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

    await createAuditEvent({
      userId,
      householdId: corrected.householdId,
      obligationId: id,
      eventType: "obligation_corrected",
      metadata: {
        correctedFields: Object.keys(updatePayload),
        reason: input.reason ?? null,
        dismissPermanently: Boolean(input.dismissPermanently),
        dontShowSimilar: Boolean(input.dontShowSimilar)
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

    const mapped = mapObligation(corrected);

    if (mapped.status === ObligationStatus.ACTIVE || mapped.status === ObligationStatus.DRAFT) {
      await this.autoFlowService.triggerForEvent({
        userId,
        obligationId: mapped.id,
        triggerType: AutoFlowTriggerType.URGENCY_TRIGGER,
        source: "correction_loop",
        reasonHint: "Corrected details changed readiness"
      });
    } else {
      await this.autoFlowService.handleObligationStatusChange(userId, mapped.id, mapped.status);
    }

    await this.captureMemorySignal({
      userId,
      referenceId: mapped.id,
      eventType: "obligation_corrected",
      metadata: {
        correctedFields: Object.keys(updatePayload),
        dontShowSimilar: Boolean(input.dontShowSimilar),
        dismissPermanently: Boolean(input.dismissPermanently)
      }
    });

    await this.predictionEngineService
      .resolveWithObligation({
        userId,
        obligationId: mapped.id,
        obligationType: mapped.type,
        vendor: mapped.vendor,
        dueDate: mapped.dueDate ? new Date(mapped.dueDate) : null
      })
      .catch(() => null);

    return mapped;
  }

  async assign(userId: string, obligationId: string, payload: unknown) {
    const input = assignSchema.parse(payload ?? {});
    const existing = await this.repository.findById(obligationId, userId);
    if (!existing) return null;
    if (existing.scopeType !== ScopeType.HOUSEHOLD || !existing.householdId) {
      throw new AppError("VALIDATION_ERROR", "Only household obligations can be assigned", 400);
    }

    await requireHouseholdMember(existing.householdId, userId);
    await ensureAssigneeIsActiveMember(existing.householdId, input.assignedToUserId);

    const updated = await this.repository.setAssignment(
      obligationId,
      userId,
      input.assignedToUserId,
      "obligation_assigned"
    );
    return updated ? mapObligation(updated) : null;
  }

  async unassign(userId: string, obligationId: string) {
    const existing = await this.repository.findById(obligationId, userId);
    if (!existing) return null;
    if (existing.scopeType !== ScopeType.HOUSEHOLD || !existing.householdId) {
      throw new AppError("VALIDATION_ERROR", "Only household obligations can be unassigned", 400);
    }

    await requireHouseholdMember(existing.householdId, userId);
    const updated = await this.repository.setAssignment(
      obligationId,
      userId,
      null,
      "obligation_unassigned"
    );
    return updated ? mapObligation(updated) : null;
  }

  async claim(userId: string, obligationId: string) {
    const existing = await this.repository.findById(obligationId, userId);
    if (!existing) return null;
    if (existing.scopeType !== ScopeType.HOUSEHOLD || !existing.householdId) {
      throw new AppError("VALIDATION_ERROR", "Only household obligations can be claimed", 400);
    }

    await requireHouseholdMember(existing.householdId, userId);
    const updated = await this.repository.setAssignment(
      obligationId,
      userId,
      userId,
      "obligation_claimed"
    );
    return updated ? mapObligation(updated) : null;
  }

  async handOff(userId: string, obligationId: string, payload: unknown) {
    const input = handOffSchema.parse(payload ?? {});
    const existing = await this.repository.findById(obligationId, userId);
    if (!existing) return null;
    if (existing.scopeType !== ScopeType.HOUSEHOLD || !existing.householdId) {
      throw new AppError("VALIDATION_ERROR", "Only household obligations can be handed off", 400);
    }

    await requireHouseholdMember(existing.householdId, userId);
    await ensureAssigneeIsActiveMember(existing.householdId, input.toUserId);

    const updated = await this.repository.setAssignment(
      obligationId,
      userId,
      input.toUserId,
      "obligation_handed_off"
    );
    return updated ? mapObligation(updated) : null;
  }

  async patchScope(userId: string, obligationId: string, payload: unknown) {
    const input = patchScopeSchema.parse(payload ?? {});
    const existing = await this.repository.findById(obligationId, userId);
    if (!existing) return null;

    if (input.scopeType === ScopeType.HOUSEHOLD) {
      if (!input.householdId) {
        throw new AppError("VALIDATION_ERROR", "householdId is required for HOUSEHOLD scope", 400);
      }
      await requireHouseholdMember(input.householdId, userId);
    }

    const updated = await this.repository.update(obligationId, userId, {
      scopeType: input.scopeType,
      householdId: input.scopeType === ScopeType.HOUSEHOLD ? input.householdId ?? null : null,
      assignedToUserId:
        input.scopeType === ScopeType.HOUSEHOLD ? existing.assignedToUserId : null
    });

    return updated ? mapObligation(updated) : null;
  }

  async listForHousehold(
    userId: string,
    householdId: string,
    query: Record<string, unknown>
  ) {
    await requireHouseholdMember(householdId, userId);
    return this.list(userId, {
      ...query,
      householdId,
      scopeType: "HOUSEHOLD"
    });
  }

  async createForHousehold(
    userId: string,
    householdId: string,
    payload: unknown
  ) {
    await requireHouseholdMember(householdId, userId);
    const body = (payload ?? {}) as Record<string, unknown>;

    return this.create({
      ...body,
      userId,
      scopeType: "HOUSEHOLD",
      householdId,
      createdByUserId: userId
    });
  }

  async getReviewQueue(userId: string, query: Record<string, unknown>) {
    const limit = parseIntegerQuery(query.limit, 50, 1, 200);
    const householdId = typeof query.householdId === "string" ? query.householdId : undefined;

    if (householdId) {
      await requireHouseholdMember(householdId, userId);
    }

    const items = await this.repository.findReviewQueueCandidates(userId, limit, householdId);
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

  private async captureMemorySignal(input: {
    userId: string;
    referenceId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.homeMemoryService
      .captureSignal({
        userId: input.userId,
        sourceType: "OBLIGATION_ACTION",
        referenceId: input.referenceId ?? null,
        eventType: input.eventType,
        metadata: input.metadata,
        rebuild: true
      })
      .catch(() => null);
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
  "commitments",
  "assigned_to_me",
  "unassigned",
  "household",
  "personal"
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
  obligationIntelligence?: {
    category?: string;
    priority?: { band?: string } | null;
    routing?: { reason?: string } | null;
  } | null;
  sourceMetadata?: {
    sourceSubtype?: string | null;
    rawData?: unknown;
  } | null;
}) {
  const reasons: string[] = [];

  if (item.conflictDetected) reasons.push("Conflicting source data detected");
  if (item.duplicateCandidate) reasons.push("Possible duplicate item");
  if (item.confidenceBand === "LOW") reasons.push("Low confidence - needs confirmation");
  if (item.confidenceBand === "MEDIUM") reasons.push("Medium confidence - review suggested");
  if (item.extractionStatus === "PARTIAL") reasons.push("Partial extraction");
  if (item.extractionStatus === "FAILED") reasons.push("Extraction failed");
  if (item.obligationIntelligence?.category) {
    reasons.push(
      `Category guess: ${item.obligationIntelligence.category.toLowerCase().replace(/_/g, " ")}`
    );
  }
  if (item.obligationIntelligence?.routing?.reason) {
    reasons.push(
      `Routing reason: ${item.obligationIntelligence.routing.reason.replace(/_/g, " ")}`
    );
  }
  if (item.obligationIntelligence?.priority?.band === "URGENT") {
    reasons.push("High priority signal detected");
  }

  if (item.sourceMetadata?.sourceSubtype === "GMAIL_READONLY") {
    const raw = asRecord(item.sourceMetadata.rawData);
    const lifecycle = asRecord(raw?.subscriptionLifecycle);
    const lifecycleType =
      typeof lifecycle?.lifecycleEmailType === "string"
        ? lifecycle.lifecycleEmailType.toLowerCase()
        : null;
    if (lifecycleType && lifecycleType !== "unknown") {
      reasons.push(`Detected from Gmail ${lifecycleType} email`);
    }
    const lifecycleConfidence = asRecord(lifecycle?.confidence);
    const lifecycleReviewReasons = Array.isArray(lifecycleConfidence?.reviewReasons)
      ? lifecycleConfidence.reviewReasons.filter((entry): entry is string => typeof entry === "string")
      : [];
    for (const reason of lifecycleReviewReasons) {
      reasons.push(reason);
    }
  }

  if (reasons.length === 0) {
    reasons.push("Draft item needs quick review");
  }

  return Array.from(new Set(reasons));
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
