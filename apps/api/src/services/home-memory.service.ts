import {
  MemoryEntityType,
  MemoryEventSourceType,
  MemoryPatternType,
  ObligationStatus,
  ObligationType,
  OutcomeType,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { HomeMemoryRepository } from "../repositories/home-memory.repository";
import { AppError } from "../utils/app-error";

const captureSignalSchema = z.object({
  userId: z.string().min(1),
  sourceType: z.nativeEnum(MemoryEventSourceType),
  referenceId: z.string().optional().nullable(),
  eventType: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  rebuild: z.boolean().optional()
});

const updatePatternSchema = z.object({
  patternData: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  frequency: z.number().int().min(0).optional(),
  isSuppressed: z.boolean().optional(),
  isUserLocked: z.boolean().optional()
});

type RebuildOutput = {
  entities: Array<{
    type: MemoryEntityType;
    name: string;
    normalizedKey: string;
    metadata?: Prisma.InputJsonValue;
  }>;
  patterns: Array<{
    patternType: MemoryPatternType;
    referenceId: string;
    patternData: Prisma.InputJsonValue;
    confidence: number;
    frequency: number;
    lastObservedAt?: Date | null;
  }>;
  context: {
    currentFocus: string | null;
    recentActions: Prisma.InputJsonValue;
    activeCategories: Prisma.InputJsonValue;
    cognitiveLoadScore: number;
  };
  summary: {
    recurringCount: number;
    behaviorProfile: string[];
    topVendors: string[];
    currentFocus: string | null;
  };
};

export class HomeMemoryService {
  private readonly repository = new HomeMemoryRepository();

  async listEntities(
    userId: string,
    query?: { type?: MemoryEntityType; limit?: number }
  ) {
    const items = await this.repository.listEntities({
      userId,
      type: query?.type,
      limit: query?.limit ?? 200
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        normalizedKey: item.normalizedKey,
        metadata: item.metadata,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      }))
    };
  }

  async listPatterns(
    userId: string,
    query?: {
      patternType?: MemoryPatternType;
      referenceId?: string;
      includeSuppressed?: boolean;
      limit?: number;
    }
  ) {
    const items = await this.repository.listPatterns({
      userId,
      patternType: query?.patternType,
      referenceId: query?.referenceId,
      includeSuppressed: query?.includeSuppressed,
      limit: query?.limit ?? 200
    });

    return {
      items: items.map((item) => mapPattern(item))
    };
  }

  async getContext(userId: string) {
    const context = await this.repository.getContext(userId);

    return {
      currentFocus: context?.currentFocus ?? null,
      recentActions: asArray(context?.recentActions).slice(0, 10),
      activeCategories: asArray(context?.activeCategories),
      cognitiveLoadScore: context ? Number(context.cognitiveLoadScore) : 0,
      updatedAt: context?.updatedAt.toISOString() ?? null
    };
  }

  async getSummary(userId: string) {
    const [patterns, entities, context] = await Promise.all([
      this.repository.listPatterns({
        userId,
        includeSuppressed: false,
        limit: 300
      }),
      this.repository.listEntities({
        userId,
        limit: 200
      }),
      this.repository.getContext(userId)
    ]);

    const recurringPatterns = patterns
      .filter((item) => item.patternType === MemoryPatternType.RECURRING_OBLIGATION)
      .map((item) => mapPattern(item));
    const behaviorPattern = patterns.find(
      (item) =>
        item.patternType === MemoryPatternType.USER_BEHAVIOR &&
        item.referenceId === "behavior:profile"
    );
    const behaviorProfile = extractBehaviorLabels(behaviorPattern?.patternData ?? null);
    const topVendors = entities
      .filter((item) => item.type === MemoryEntityType.VENDOR)
      .slice(0, 5)
      .map((item) => item.name);

    return {
      recurringPatterns,
      behaviorProfile: {
        labels: behaviorProfile,
        confidence: behaviorPattern ? Number(behaviorPattern.confidence) : 0,
        frequency: behaviorPattern?.frequency ?? 0
      },
      currentContext: {
        currentFocus: context?.currentFocus ?? null,
        recentActions: asArray(context?.recentActions).slice(0, 10),
        activeCategories: asArray(context?.activeCategories),
        cognitiveLoadScore: context ? Number(context.cognitiveLoadScore) : 0,
        updatedAt: context?.updatedAt.toISOString() ?? null
      },
      topVendors
    };
  }

  async rebuild(userId: string) {
    const computed = await this.computeMemory(userId);
    await this.persistComputedMemory(userId, computed, {
      sourceType: MemoryEventSourceType.SYSTEM_REBUILD,
      eventType: "memory_rebuilt_manual"
    });

    return {
      rebuiltAt: new Date().toISOString(),
      summary: computed.summary
    };
  }

  async captureSignal(payload: unknown) {
    const input = captureSignalSchema.parse(payload);

    await this.repository.createMemoryEvent({
      userId: input.userId,
      sourceType: input.sourceType,
      referenceId: input.referenceId ?? null,
      eventType: input.eventType,
      metadata: input.metadata as Prisma.InputJsonValue | undefined
    });

    if (input.rebuild === false) {
      return;
    }

    const computed = await this.computeMemory(input.userId);
    await this.persistComputedMemory(input.userId, computed, {
      sourceType: input.sourceType,
      eventType: "memory_rebuilt_from_signal",
      referenceId: input.referenceId ?? null,
      signalEventType: input.eventType
    });
  }

  async updatePattern(userId: string, patternId: string, payload: unknown) {
    const input = updatePatternSchema.parse(payload ?? {});
    const pattern = await this.repository.findPatternByIdForUser(userId, patternId);
    if (!pattern) {
      throw new AppError("NOT_FOUND", "Memory pattern not found", 404);
    }

    const nextData: Prisma.MemoryPatternUncheckedUpdateInput = {};
    if (input.patternData !== undefined) {
      nextData.patternData = input.patternData as Prisma.InputJsonValue;
    }
    if (input.confidence !== undefined) {
      nextData.confidence = round(input.confidence, 4);
    }
    if (input.frequency !== undefined) {
      nextData.frequency = input.frequency;
    }
    if (input.isSuppressed !== undefined) {
      nextData.isSuppressed = input.isSuppressed;
    }
    if (input.isUserLocked !== undefined) {
      nextData.isUserLocked = input.isUserLocked;
    }

    const updated = await this.repository.updatePattern(patternId, nextData);
    await this.repository.createMemoryEvent({
      userId,
      sourceType: MemoryEventSourceType.FEEDBACK,
      referenceId: patternId,
      eventType: "memory_pattern_updated",
      metadata: {
        updatedFields: Object.keys(nextData)
      }
    });

    return mapPattern(updated);
  }

  async deletePattern(userId: string, patternId: string) {
    const pattern = await this.repository.findPatternByIdForUser(userId, patternId);
    if (!pattern) {
      throw new AppError("NOT_FOUND", "Memory pattern not found", 404);
    }

    await this.repository.deletePattern(patternId);
    await this.repository.createMemoryEvent({
      userId,
      sourceType: MemoryEventSourceType.FEEDBACK,
      referenceId: patternId,
      eventType: "memory_pattern_deleted",
      metadata: {
        patternType: pattern.patternType,
        referenceId: pattern.referenceId
      }
    });
  }

  async getDecisionSignals(userId: string) {
    const [patterns, context] = await Promise.all([
      this.repository.listPatterns({
        userId,
        includeSuppressed: false,
        limit: 300
      }),
      this.repository.getContext(userId)
    ]);

    const recurringVendors: string[] = [];
    const recurringVendorKeys = new Set<string>();
    const recurringByType = new Set<string>();
    let behaviorLabels: string[] = [];

    for (const pattern of patterns) {
      if (pattern.patternType === MemoryPatternType.RECURRING_OBLIGATION) {
        const record = asRecord(pattern.patternData);
        const vendor = toStringOrNull(record?.vendor);
        const vendorKey = toStringOrNull(record?.vendorKey);
        const obligationType = toStringOrNull(record?.obligationType);
        if (vendor) recurringVendors.push(vendor);
        if (vendorKey) recurringVendorKeys.add(vendorKey);
        if (obligationType && vendorKey) recurringByType.add(`${vendorKey}:${obligationType}`);
      }

      if (
        pattern.patternType === MemoryPatternType.USER_BEHAVIOR &&
        pattern.referenceId === "behavior:profile"
      ) {
        behaviorLabels = extractBehaviorLabels(pattern.patternData);
      }
    }

    return {
      currentFocus: context?.currentFocus ?? null,
      cognitiveLoadScore: context ? Number(context.cognitiveLoadScore) : 0,
      activeCategories: asArray(context?.activeCategories),
      behaviorLabels,
      recurringVendors,
      recurringVendorKeys: Array.from(recurringVendorKeys),
      recurringVendorTypeKeys: Array.from(recurringByType)
    };
  }

  private async computeMemory(userId: string): Promise<RebuildOutput> {
    const [obligations, feedbackEvents, auditEvents, outcomeFeedback] = await Promise.all([
      this.repository.listRebuildObligations(userId),
      this.repository.listRebuildFeedback(userId),
      this.repository.listRebuildAuditEvents(userId),
      this.repository.listRebuildOutcomeFeedback(userId)
    ]);

    const entities = deriveEntities(obligations);
    const recurringPatterns = deriveRecurringPatterns(obligations);
    const behaviorPattern = deriveBehaviorPattern(obligations, feedbackEvents, auditEvents, outcomeFeedback);
    const timingPattern = deriveTimingPattern(auditEvents, outcomeFeedback);
    const context = deriveContext(obligations, auditEvents);

    const patterns = [
      ...recurringPatterns,
      behaviorPattern,
      timingPattern
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    return {
      entities,
      patterns,
      context,
      summary: {
        recurringCount: recurringPatterns.length,
        behaviorProfile: extractBehaviorLabels(behaviorPattern?.patternData ?? null),
        topVendors: entities
          .filter((item) => item.type === MemoryEntityType.VENDOR)
          .slice(0, 5)
          .map((item) => item.name),
        currentFocus: context.currentFocus
      }
    };
  }

  private async persistComputedMemory(
    userId: string,
    computed: RebuildOutput,
    input: {
      sourceType: MemoryEventSourceType;
      eventType: string;
      referenceId?: string | null;
      signalEventType?: string;
    }
  ) {
    await this.repository.runInTransaction(async (tx) => {
      await this.repository.replaceEntities(userId, computed.entities, tx);

      const keepRefs = new Map<MemoryPatternType, string[]>();
      keepRefs.set(MemoryPatternType.RECURRING_OBLIGATION, []);
      keepRefs.set(MemoryPatternType.USER_BEHAVIOR, []);
      keepRefs.set(MemoryPatternType.TIMING_PATTERN, []);

      for (const pattern of computed.patterns) {
        const updated = await this.repository.upsertPattern(
          {
            userId,
            patternType: pattern.patternType,
            referenceId: pattern.referenceId,
            patternData: pattern.patternData,
            confidence: round(pattern.confidence, 4),
            frequency: pattern.frequency,
            lastObservedAt: pattern.lastObservedAt ?? null
          },
          tx
        );

        keepRefs.get(updated.patternType)?.push(updated.referenceId);
      }

      for (const patternType of [
        MemoryPatternType.RECURRING_OBLIGATION,
        MemoryPatternType.USER_BEHAVIOR,
        MemoryPatternType.TIMING_PATTERN
      ]) {
        await this.repository.deleteStaleDerivedPatterns(
          {
            userId,
            patternType,
            keepReferenceIds: keepRefs.get(patternType) ?? []
          },
          tx
        );
      }

      await this.repository.upsertContext(
        {
          userId,
          currentFocus: computed.context.currentFocus,
          recentActions: computed.context.recentActions,
          activeCategories: computed.context.activeCategories,
          cognitiveLoadScore: round(computed.context.cognitiveLoadScore, 4)
        },
        tx
      );

      await this.repository.createMemoryEvent(
        {
          userId,
          sourceType: input.sourceType,
          referenceId: input.referenceId ?? null,
          eventType: input.eventType,
          metadata: {
            signalEventType: input.signalEventType ?? null,
            recurringCount: computed.summary.recurringCount,
            behaviorProfile: computed.summary.behaviorProfile,
            currentFocus: computed.summary.currentFocus,
            topVendors: computed.summary.topVendors
          }
        },
        tx
      );
    });
  }
}

function deriveEntities(
  obligations: Awaited<ReturnType<HomeMemoryRepository["listRebuildObligations"]>>
) {
  const entities: Array<{
    type: MemoryEntityType;
    name: string;
    normalizedKey: string;
    metadata?: Prisma.InputJsonValue;
  }> = [];

  const vendorStats = new Map<
    string,
    { name: string; count: number; lastSeenAt: Date | null; avgAmount: number | null }
  >();
  const categoryStats = new Map<ObligationType, number>();
  const subscriptionStats = new Map<string, { name: string; count: number; recurrence: string | null }>();

  for (const item of obligations) {
    categoryStats.set(item.type, (categoryStats.get(item.type) ?? 0) + 1);

    if (item.vendor) {
      const key = normalizeKey(item.vendor);
      const existing = vendorStats.get(key) ?? {
        name: item.vendor,
        count: 0,
        lastSeenAt: null,
        avgAmount: null
      };
      existing.count += 1;
      existing.lastSeenAt = latestDate(existing.lastSeenAt, item.updatedAt);
      if (item.amount) {
        const amount = Number(item.amount);
        existing.avgAmount =
          existing.avgAmount === null ? amount : round((existing.avgAmount + amount) / 2, 2);
      }
      vendorStats.set(key, existing);
    }

    if (item.type === ObligationType.SUBSCRIPTION && item.vendor) {
      const key = normalizeKey(item.vendor);
      const existing = subscriptionStats.get(key) ?? {
        name: item.vendor,
        count: 0,
        recurrence: item.recurrence ?? null
      };
      existing.count += 1;
      if (!existing.recurrence && item.recurrence) {
        existing.recurrence = item.recurrence;
      }
      subscriptionStats.set(key, existing);
    }
  }

  for (const [key, value] of vendorStats.entries()) {
    entities.push({
      type: MemoryEntityType.VENDOR,
      name: value.name,
      normalizedKey: key,
      metadata: {
        occurrenceCount: value.count,
        avgAmount: value.avgAmount,
        lastSeenAt: value.lastSeenAt?.toISOString() ?? null
      }
    });
  }

  for (const [type, count] of categoryStats.entries()) {
    entities.push({
      type: MemoryEntityType.CATEGORY,
      name: type,
      normalizedKey: normalizeKey(type),
      metadata: {
        obligationType: type,
        openCount: count
      }
    });
  }

  for (const [key, value] of subscriptionStats.entries()) {
    entities.push({
      type: MemoryEntityType.SUBSCRIPTION,
      name: value.name,
      normalizedKey: key,
      metadata: {
        occurrenceCount: value.count,
        recurrence: value.recurrence
      }
    });
  }

  return entities.sort((a, b) => a.name.localeCompare(b.name));
}

function deriveRecurringPatterns(
  obligations: Awaited<ReturnType<HomeMemoryRepository["listRebuildObligations"]>>
): Array<{
  patternType: MemoryPatternType;
  referenceId: string;
  patternData: Prisma.InputJsonValue;
  confidence: number;
  frequency: number;
  lastObservedAt: Date | null;
}> {
  const grouped = new Map<string, typeof obligations>();
  for (const item of obligations) {
    if (!item.vendor) continue;
    if (!item.dueDate) continue;
    if (item.status === ObligationStatus.IGNORED) continue;
    const vendorKey = normalizeKey(item.vendor);
    const key = `${vendorKey}:${item.type}`;
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }

  const patterns: Array<{
    patternType: MemoryPatternType;
    referenceId: string;
    patternData: Prisma.InputJsonValue;
    confidence: number;
    frequency: number;
    lastObservedAt: Date | null;
  }> = [];

  for (const [groupKey, items] of grouped.entries()) {
    if (items.length < 2) continue;

    const sorted = [...items].sort(
      (a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0)
    );
    const intervals: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1]?.dueDate;
      const current = sorted[index]?.dueDate;
      if (!prev || !current) continue;
      const days = (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (days > 0) intervals.push(days);
    }
    if (intervals.length === 0) continue;

    const averageInterval = average(intervals);
    const variance = varianceFromAverage(intervals, averageInterval);
    const recurrenceType = resolveRecurrenceType(averageInterval);
    const amounts = sorted
      .map((item) => (item.amount ? Number(item.amount) : null))
      .filter((value): value is number => value !== null);
    const amountVariance = amounts.length > 1 ? varianceFromAverage(amounts, average(amounts)) : 0;

    const vendor = sorted[0]?.vendor ?? "Unknown";
    const vendorKey = normalizeKey(vendor);
    const obligationType = sorted[0]?.type ?? ObligationType.COMMITMENT;
    const frequency = sorted.length;

    let confidence = 0.42;
    confidence += Math.min(0.22, (frequency - 2) * 0.05);
    confidence += variance <= 4 ? 0.2 : variance <= 10 ? 0.12 : variance <= 20 ? 0.05 : 0;
    if (recurrenceType !== "IRREGULAR") confidence += 0.1;
    confidence += amountVariance <= 25 ? 0.06 : amountVariance <= 100 ? 0.03 : 0;
    confidence = clamp(round(confidence, 4), 0.4, 0.96);

    const lastDueDate = sorted[sorted.length - 1]?.dueDate ?? null;
    const expectedNext = lastDueDate
      ? new Date(lastDueDate.getTime() + averageInterval * 24 * 60 * 60 * 1000)
      : null;

    patterns.push({
      patternType: MemoryPatternType.RECURRING_OBLIGATION,
      referenceId: `recurring:${groupKey}`,
      confidence,
      frequency,
      lastObservedAt: sorted[sorted.length - 1]?.updatedAt ?? null,
      patternData: {
        patternKind: "recurring_obligation",
        vendor,
        vendorKey,
        obligationType,
        recurrenceType,
        occurrenceCount: frequency,
        averageIntervalDays: round(averageInterval, 2),
        intervalVarianceDays: round(variance, 2),
        expectedNextOccurrence: expectedNext?.toISOString() ?? null,
        typicalAmount: amounts.length > 0 ? round(average(amounts), 2) : null,
        amountVariance: amounts.length > 1 ? round(amountVariance, 2) : null,
        reason:
          recurrenceType === "IRREGULAR"
            ? `Recurring activity detected for ${vendor}.`
            : `${vendor} appears every ~${Math.round(averageInterval)} days.`
      }
    });
  }

  return patterns;
}

function deriveBehaviorPattern(
  obligations: Awaited<ReturnType<HomeMemoryRepository["listRebuildObligations"]>>,
  feedbackEvents: Awaited<ReturnType<HomeMemoryRepository["listRebuildFeedback"]>>,
  auditEvents: Awaited<ReturnType<HomeMemoryRepository["listRebuildAuditEvents"]>>,
  outcomeFeedback: Awaited<ReturnType<HomeMemoryRepository["listRebuildOutcomeFeedback"]>>
):
  | {
      patternType: MemoryPatternType;
      referenceId: string;
      patternData: Prisma.InputJsonValue;
      confidence: number;
      frequency: number;
      lastObservedAt: Date | null;
    }
  | null {
  let completed = 0;
  let postponed = 0;
  let dismissed = 0;
  let guidedActions = 0;
  let manualActions = 0;
  let total = 0;
  let lastObserved: Date | null = null;

  for (const item of auditEvents) {
    if (item.eventType === "obligation_marked_done" || item.eventType === "focus_session_item_completed") {
      completed += 1;
      manualActions += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    } else if (item.eventType === "obligation_postponed" || item.eventType === "focus_session_item_postponed") {
      postponed += 1;
      manualActions += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    } else if (item.eventType === "obligation_dismissed" || item.eventType === "focus_session_item_dismissed") {
      dismissed += 1;
      manualActions += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    } else if (
      item.eventType.startsWith("guided_journey_") ||
      item.eventType === "focus_session_item_skipped"
    ) {
      guidedActions += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    }
  }

  for (const item of feedbackEvents) {
    if (item.type === "COMPLETED") {
      completed += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    } else if (item.type === "POSTPONED") {
      postponed += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    } else if (item.type === "DONT_SHOW_AGAIN" || item.type === "NOT_RELEVANT") {
      dismissed += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    }
  }

  for (const item of outcomeFeedback) {
    if (item.outcomeType === OutcomeType.COMPLETED_SUCCESSFULLY) {
      completed += 1;
      guidedActions += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    } else if (item.outcomeType === OutcomeType.POSTPONED_INTENTIONALLY) {
      postponed += 1;
      guidedActions += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    } else if (
      item.outcomeType === OutcomeType.DISMISSED_NOT_RELEVANT ||
      item.outcomeType === OutcomeType.ABANDONED
    ) {
      dismissed += 1;
      guidedActions += 1;
      total += 1;
      lastObserved = latestDate(lastObserved, item.createdAt);
    }
  }

  if (total === 0) return null;

  const completionRate = completed / total;
  const postponementRate = postponed / total;
  const dismissalRate = dismissed / total;

  const labels: string[] = [];
  if (completionRate >= 0.55 && postponementRate <= 0.28) {
    labels.push("quick-win friendly");
  }
  if (postponementRate >= 0.4) {
    labels.push("postpone-heavy");
  }
  if (dismissalRate >= 0.3) {
    labels.push("noise-sensitive");
  }
  if (guidedActions > manualActions * 1.2) {
    labels.push("guided-first");
  } else if (manualActions > guidedActions * 1.2) {
    labels.push("manual-first");
  }
  if (labels.length === 0) {
    labels.push("balanced");
  }

  const activeCount = obligations.filter(
    (item) => item.status === ObligationStatus.ACTIVE || item.status === ObligationStatus.POSTPONED
  ).length;
  const confidence = clamp(0.45 + Math.min(0.4, total / 40) + Math.min(0.12, activeCount / 80), 0.45, 0.95);

  return {
    patternType: MemoryPatternType.USER_BEHAVIOR,
    referenceId: "behavior:profile",
    confidence: round(confidence, 4),
    frequency: total,
    lastObservedAt: lastObserved,
    patternData: {
      patternKind: "user_behavior_profile",
      completionRate: round(completionRate, 4),
      postponementRate: round(postponementRate, 4),
      dismissalRate: round(dismissalRate, 4),
      guidedActions,
      manualActions,
      labels,
      reason:
        labels[0] === "postpone-heavy"
          ? "Postponement is common in recent behavior."
          : labels[0] === "quick-win friendly"
            ? "You tend to complete quick items once surfaced."
            : "Behavior is mixed across completion, postpone, and dismiss."
    }
  };
}

function deriveTimingPattern(
  auditEvents: Awaited<ReturnType<HomeMemoryRepository["listRebuildAuditEvents"]>>,
  outcomeFeedback: Awaited<ReturnType<HomeMemoryRepository["listRebuildOutcomeFeedback"]>>
):
  | {
      patternType: MemoryPatternType;
      referenceId: string;
      patternData: Prisma.InputJsonValue;
      confidence: number;
      frequency: number;
      lastObservedAt: Date | null;
    }
  | null {
  const actionableEventNames = new Set([
    "obligation_marked_done",
    "obligation_postponed",
    "obligation_dismissed",
    "focus_session_item_completed",
    "focus_session_item_postponed",
    "focus_session_item_dismissed",
    "guided_journey_completed"
  ]);

  const timestamps: Date[] = [];
  for (const event of auditEvents) {
    if (actionableEventNames.has(event.eventType)) {
      timestamps.push(event.createdAt);
    }
  }
  for (const event of outcomeFeedback) {
    timestamps.push(event.createdAt);
  }

  if (timestamps.length < 5) return null;

  const hourCounts = new Map<number, number>();
  for (const timestamp of timestamps) {
    const hour = timestamp.getUTCHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  const ranked = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return null;

  const topHour = top[0];
  const topCount = top[1];
  const dominance = topCount / timestamps.length;
  const confidence = clamp(0.4 + dominance * 0.4 + Math.min(0.2, timestamps.length / 60), 0.4, 0.9);

  return {
    patternType: MemoryPatternType.TIMING_PATTERN,
    referenceId: "timing:preferred_execution_window",
    confidence: round(confidence, 4),
    frequency: timestamps.length,
    lastObservedAt: timestamps[0] ?? null,
    patternData: {
      patternKind: "timing_window",
      preferredHourUtc: topHour,
      preferredWindow: toWindowLabel(topHour),
      sampleSize: timestamps.length,
      reason: `Most actions happen around ${formatHour(topHour)} UTC.`,
      hourDistribution: ranked.slice(0, 6).map(([hour, count]) => ({
        hourUtc: hour,
        count
      }))
    }
  };
}

function deriveContext(
  obligations: Awaited<ReturnType<HomeMemoryRepository["listRebuildObligations"]>>,
  auditEvents: Awaited<ReturnType<HomeMemoryRepository["listRebuildAuditEvents"]>>
) {
  const active = obligations.filter(
    (item) => item.status === ObligationStatus.ACTIVE || item.status === ObligationStatus.POSTPONED
  );
  const drafts = obligations.filter((item) => item.status === ObligationStatus.DRAFT);
  const urgent = active.filter(
    (item) =>
      Number(item.urgencyScore) >= 85 ||
      Boolean(item.dueDate && item.dueDate.getTime() <= Date.now() + 48 * 60 * 60 * 1000)
  );
  const postponed = active.filter((item) => item.status === ObligationStatus.POSTPONED);
  const recentCompletions = auditEvents.filter(
    (item) =>
      item.eventType === "obligation_marked_done" &&
      item.createdAt.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
  ).length;

  const categoryStats = new Map<ObligationType, { count: number; urgencyWeight: number }>();
  for (const item of active) {
    const existing = categoryStats.get(item.type) ?? { count: 0, urgencyWeight: 0 };
    existing.count += 1;
    existing.urgencyWeight += Number(item.urgencyScore);
    categoryStats.set(item.type, existing);
  }

  const sortedCategories = Array.from(categoryStats.entries())
    .map(([type, value]) => ({
      type,
      count: value.count,
      urgencyWeight: round(value.urgencyWeight, 2),
      score: value.count * 2 + value.urgencyWeight / Math.max(1, value.count)
    }))
    .sort((a, b) => b.score - a.score);

  const currentFocus = sortedCategories[0]?.type ?? null;
  const activeCategories = sortedCategories.map((item) => ({
    category: item.type,
    count: item.count,
    urgencyWeight: item.urgencyWeight
  }));

  const recentActions = auditEvents
    .slice(0, 10)
    .map((event) => ({
      eventType: event.eventType,
      obligationId: event.obligationId,
      createdAt: event.createdAt.toISOString()
    }));

  const loadScore = clamp(
    active.length * 4 +
      urgent.length * 9 +
      drafts.length * 6 +
      postponed.length * 4 -
      recentCompletions * 2,
    0,
    100
  );

  return {
    currentFocus,
    recentActions,
    activeCategories,
    cognitiveLoadScore: round(loadScore, 4)
  };
}

function mapPattern(item: {
  id: string;
  patternType: MemoryPatternType;
  referenceId: string;
  patternData: Prisma.JsonValue;
  confidence: Prisma.Decimal;
  frequency: number;
  lastObservedAt: Date | null;
  isUserLocked: boolean;
  isSuppressed: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: item.id,
    patternType: item.patternType,
    referenceId: item.referenceId,
    patternData: item.patternData,
    confidence: Number(item.confidence),
    frequency: item.frequency,
    lastObservedAt: item.lastObservedAt?.toISOString() ?? null,
    isUserLocked: item.isUserLocked,
    isSuppressed: item.isSuppressed,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function extractBehaviorLabels(value: unknown) {
  const record = asRecord(value);
  const labels = Array.isArray(record?.labels)
    ? record.labels.filter((item): item is string => typeof item === "string")
    : [];
  return labels;
}

function resolveRecurrenceType(averageIntervalDays: number) {
  if (averageIntervalDays >= 5 && averageIntervalDays <= 9) return "WEEKLY";
  if (averageIntervalDays >= 12 && averageIntervalDays <= 18) return "BIWEEKLY";
  if (averageIntervalDays >= 24 && averageIntervalDays <= 38) return "MONTHLY";
  if (averageIntervalDays >= 330 && averageIntervalDays <= 390) return "YEARLY";
  return "IRREGULAR";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function varianceFromAverage(values: number[], avg: number) {
  if (values.length <= 1) return 0;
  const squared = values.map((value) => Math.pow(value - avg, 2));
  return average(squared);
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function latestDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return right.getTime() > left.getTime() ? right : left;
}

function toWindowLabel(hour: number) {
  if (hour >= 5 && hour <= 10) return "morning";
  if (hour >= 11 && hour <= 15) return "midday";
  if (hour >= 16 && hour <= 20) return "evening";
  return "night";
}

function formatHour(hour: number) {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const base = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${base}:00 ${suffix}`;
}

function round(value: number, places: number) {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value;
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}
