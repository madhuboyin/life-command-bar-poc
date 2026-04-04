import {
  AutoFlowStateStatus,
  AutoFlowTriggerType,
  ObligationStatus,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import {
  AutoFlowRepository,
  type AutoFlowWithRelations
} from "../repositories/auto-flow.repository";
import { PersonalizationService } from "./personalization.service";
import { mapObligation } from "../utils/obligation.mapper";
import { AppError } from "../utils/app-error";
import type { DecisionTrace, TrustWhy } from "../utils/trust-layer";
import { toWhyConfidence } from "../utils/trust-layer";

const MAX_DAILY_AUTO_FLOW_ITEMS = 8;
const RECENT_DUPLICATE_WINDOW_HOURS = 12;
const DISMISS_SUPPRESSION_DAYS = 14;
const DISMISS_SUPPRESSION_COUNT = 2;

const manualTriggerSchema = z.object({
  userId: z.string().min(1),
  obligationId: z.string().min(1),
  triggerType: z
    .enum([
      "INGESTION_TRIGGER",
      "URGENCY_TRIGGER",
      "PATTERN_TRIGGER",
      "REMINDER_TRIGGER"
    ])
    .optional(),
  source: z.string().optional()
});

export type AutoFlowSurfaceItem = {
  id: string;
  obligationId: string;
  triggerType: AutoFlowTriggerType;
  state: AutoFlowStateStatus;
  confidence: number;
  urgencyScore: number;
  priorityScore: number;
  source: string | null;
  reason: string | null;
  timestamp: string;
  obligation: ReturnType<typeof mapObligation>;
  why: TrustWhy;
  decisionTrace: DecisionTrace;
  cta: {
    label: string;
    action: "OPEN_GUIDED";
  };
};

type TriggerInput = {
  userId: string;
  obligationId: string;
  triggerType: AutoFlowTriggerType;
  source?: string | null;
  reasonHint?: string | null;
};

export class AutoFlowService {
  private readonly repository = new AutoFlowRepository();
  private readonly personalizationService = new PersonalizationService();

  async list(userId: string, options?: { limit?: number; includeAccepted?: boolean }) {
    await this.processDueReminderTriggers(userId);

    const states = options?.includeAccepted
      ? [AutoFlowStateStatus.READY, AutoFlowStateStatus.SUGGESTED, AutoFlowStateStatus.ACCEPTED]
      : [AutoFlowStateStatus.READY, AutoFlowStateStatus.SUGGESTED];

    const rows = await this.repository.listForUser({
      userId,
      states,
      limit: options?.limit ?? 20
    });

    const items = rows.map((row) => this.toSurfaceItem(row));

    return {
      generatedAt: new Date().toISOString(),
      items,
      summary: {
        readyCount: items.filter((item) => item.state === AutoFlowStateStatus.READY).length,
        suggestedCount: items.filter((item) => item.state === AutoFlowStateStatus.SUGGESTED).length
      }
    };
  }

  async getBoostMapByObligationIds(userId: string, obligationIds: string[]) {
    if (obligationIds.length === 0) {
      return new Map<string, AutoFlowSurfaceItem>();
    }

    await this.processDueReminderTriggers(userId);
    const uniqueIds = Array.from(new Set(obligationIds));
    const rows = await this.repository.listForUser({
      userId,
      states: [AutoFlowStateStatus.READY, AutoFlowStateStatus.SUGGESTED],
      limit: 120
    });

    const byObligation = new Map<string, AutoFlowSurfaceItem>();
    for (const row of rows) {
      if (!uniqueIds.includes(row.obligationId)) continue;

      const next = this.toSurfaceItem(row);
      const existing = byObligation.get(row.obligationId);
      if (!existing || next.priorityScore > existing.priorityScore) {
        byObligation.set(row.obligationId, next);
      }
    }

    return byObligation;
  }

  async trigger(payload: unknown) {
    const input = manualTriggerSchema.parse(payload);
    const result = await this.triggerForEvent({
      userId: input.userId,
      obligationId: input.obligationId,
      triggerType: input.triggerType ?? AutoFlowTriggerType.PATTERN_TRIGGER,
      source: input.source ?? "manual_trigger"
    });

    return {
      triggered: Boolean(result),
      item: result
    };
  }

  async triggerForEvent(input: TriggerInput) {
    const obligation = await this.repository.findObligationByIdForUser(
      input.userId,
      input.obligationId
    );
    if (!obligation) {
      return null;
    }

    if (!isEligibleObligationStatus(obligation.status, input.triggerType)) {
      return null;
    }

    const now = new Date();
    const recentDuplicate = await this.repository.findRecentForObligationTrigger({
      userId: input.userId,
      obligationId: input.obligationId,
      triggerType: input.triggerType,
      since: new Date(now.getTime() - RECENT_DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000)
    });
    if (recentDuplicate) {
      return null;
    }

    const dismissedCount = await this.repository.countDismissedRecently({
      userId: input.userId,
      obligationId: input.obligationId,
      since: new Date(now.getTime() - DISMISS_SUPPRESSION_DAYS * 24 * 60 * 60 * 1000)
    });
    if (dismissedCount >= DISMISS_SUPPRESSION_COUNT) {
      return null;
    }

    const createdToday = await this.repository.countCreatedToday(input.userId, now);
    if (createdToday >= MAX_DAILY_AUTO_FLOW_ITEMS) {
      return null;
    }

    const signals = await this.personalizationService.getSignals(input.userId).catch(() => null);
    const evaluation = evaluateAutoFlowPriority({
      obligation: mapObligation(obligation),
      triggerType: input.triggerType,
      signals,
      reasonHint: input.reasonHint ?? null
    });

    if (!evaluation.shouldTrigger) {
      return null;
    }

    const activeExisting = await this.repository.findLatestActiveForObligation(
      input.userId,
      input.obligationId
    );
    if (activeExisting && Number(activeExisting.priorityScore) >= evaluation.priorityScore) {
      return null;
    }

    const created = await this.repository.create({
      userId: input.userId,
      obligationId: input.obligationId,
      triggerType: input.triggerType,
      state: evaluation.state,
      confidenceScore: evaluation.confidenceScore,
      urgencyScore: evaluation.urgencyScore,
      priorityScore: evaluation.priorityScore,
      sourceType: input.source ?? obligation.source,
      reason: evaluation.primaryReason,
      metadata: {
        signals: evaluation.signals,
        reasonHint: input.reasonHint ?? null,
        personalizationApplied: Boolean(signals)
      }
    });

    await this.repository.createAuditEvent({
      userId: input.userId,
      obligationId: input.obligationId,
      eventType: "auto_flow_triggered",
      metadata: {
        autoFlowStateId: created.id,
        triggerType: input.triggerType,
        state: evaluation.state,
        priorityScore: evaluation.priorityScore
      }
    });

    return this.toSurfaceItem(created);
  }

  async processDueReminderTriggers(userId: string) {
    const dueReminders = await this.repository.listDueScheduledReminders(userId, new Date());
    if (dueReminders.length === 0) return;

    await this.repository.runInTransaction(async (tx) => {
      for (const reminder of dueReminders) {
        await this.repository.markReminderTriggered(reminder.id, tx);

        await this.repository.createAuditEvent(
          {
            userId,
            obligationId: reminder.obligationId,
            eventType: "reminder_triggered",
            metadata: {
              reminderId: reminder.id
            }
          },
          tx
        );
      }
    });

    for (const reminder of dueReminders) {
      if (!reminder.obligationId) continue;
      await this.triggerForEvent({
        userId,
        obligationId: reminder.obligationId,
        triggerType: AutoFlowTriggerType.REMINDER_TRIGGER,
        source: "reminder_fire",
        reasonHint: "Reminder is due now"
      });
    }
  }

  async accept(userId: string, autoFlowId: string) {
    const item = await this.repository.findByIdForUser(userId, autoFlowId);
    if (!item) return null;

    const updated = await this.repository.update(autoFlowId, {
      state: AutoFlowStateStatus.ACCEPTED,
      acceptedAt: new Date()
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId: updated.obligationId,
      eventType: "auto_flow_accepted",
      metadata: {
        autoFlowStateId: updated.id
      }
    });

    return this.toSurfaceItem(updated);
  }

  async dismiss(userId: string, autoFlowId: string, reason?: string) {
    const item = await this.repository.findByIdForUser(userId, autoFlowId);
    if (!item) return null;

    const dismissedCount = (item.dismissedCount ?? 0) + 1;
    const updated = await this.repository.update(autoFlowId, {
      state: AutoFlowStateStatus.DISMISSED,
      reason: reason ?? "dismissed_by_user",
      dismissedAt: new Date(),
      dismissedCount
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId: updated.obligationId,
      eventType: "auto_flow_dismissed",
      metadata: {
        autoFlowStateId: updated.id,
        dismissedCount,
        reason: reason ?? null
      }
    });

    return this.toSurfaceItem(updated);
  }

  async handleObligationStatusChange(
    userId: string,
    obligationId: string,
    nextStatus: ObligationStatus
  ) {
    if (
      nextStatus === ObligationStatus.RESOLVED ||
      nextStatus === ObligationStatus.IGNORED ||
      nextStatus === ObligationStatus.POSTPONED
    ) {
      await this.repository.dismissActiveForObligation({
        userId,
        obligationId,
        reason: "obligation_no_longer_active"
      });
    }
  }

  async triggerFromRelatedAction(input: {
    userId: string;
    completedObligationId: string;
    completedObligationType: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  }) {
    const nextCandidate = await this.repository.findNextPatternCandidate({
      userId: input.userId,
      type: input.completedObligationType,
      excludeObligationId: input.completedObligationId
    });
    if (!nextCandidate) return null;

    return this.triggerForEvent({
      userId: input.userId,
      obligationId: nextCandidate.id,
      triggerType: AutoFlowTriggerType.PATTERN_TRIGGER,
      source: "related_action",
      reasonHint: "You just completed a similar item"
    });
  }

  private toSurfaceItem(row: AutoFlowWithRelations): AutoFlowSurfaceItem {
    const obligation = mapObligation(row.obligation);
    const why = buildWhy(row, obligation);

    return {
      id: row.id,
      obligationId: row.obligationId,
      triggerType: row.triggerType,
      state: row.state,
      confidence: Number(row.confidenceScore),
      urgencyScore: Number(row.urgencyScore),
      priorityScore: Number(row.priorityScore),
      source: row.sourceType ?? null,
      reason: row.reason,
      timestamp: row.createdAt.toISOString(),
      obligation,
      why,
      decisionTrace: {
        sourceSignals: [
          `trigger:${row.triggerType.toLowerCase()}`,
          `source:${(row.sourceType ?? "system").toLowerCase()}`
        ],
        rankingFactors: [
          `priority:${Math.round(Number(row.priorityScore))}`,
          `urgency:${Math.round(Number(row.urgencyScore))}`
        ],
        suppressionFactors: row.state === AutoFlowStateStatus.SUGGESTED ? ["not_ready"] : [],
        confidenceDrivers: [
          `confidence:${Math.round(Number(row.confidenceScore) * 100)}`,
          `band:${obligation.confidenceBand.toLowerCase()}`
        ]
      },
      cta: {
        label: row.state === AutoFlowStateStatus.READY ? "Handle now" : "Review and handle",
        action: "OPEN_GUIDED"
      }
    };
  }
}

function isEligibleObligationStatus(status: ObligationStatus, triggerType: AutoFlowTriggerType) {
  if (status === ObligationStatus.ACTIVE || status === ObligationStatus.POSTPONED) {
    return true;
  }
  if (triggerType === AutoFlowTriggerType.INGESTION_TRIGGER && status === ObligationStatus.DRAFT) {
    return true;
  }
  return false;
}

function evaluateAutoFlowPriority(input: {
  obligation: ReturnType<typeof mapObligation>;
  triggerType: AutoFlowTriggerType;
  signals: Awaited<ReturnType<PersonalizationService["getSignals"]>> | null;
  reasonHint: string | null;
}) {
  const confidence = input.obligation.confidenceScore;
  const urgency = input.obligation.urgencyScore;
  const importance = input.obligation.importanceScore;

  const impactBonus =
    input.obligation.impactLevel === "HIGH"
      ? 12
      : input.obligation.impactLevel === "MEDIUM"
        ? 6
        : 2;
  const confidenceWeight = confidence * 100 * 0.25;
  const urgencyWeight = urgency * 0.4;
  const impactWeight = importance * 0.28 + impactBonus;
  const personalizationWeight = getPersonalizationWeight(input);

  let priorityScore = clamp(
    urgencyWeight + impactWeight + confidenceWeight + personalizationWeight,
    0,
    100
  );

  const dueSoon = isDueWithinHours(input.obligation.dueDate, 48);
  const quickWin =
    input.obligation.effortLevel === "LOW" &&
    (input.obligation.impactLevel === "MEDIUM" || input.obligation.impactLevel === "HIGH");
  const moneyExposure = (input.obligation.amount ?? 0) > 0;

  if (dueSoon) {
    priorityScore = clamp(priorityScore + 8, 0, 100);
  }
  if (quickWin && confidence >= 0.62) {
    priorityScore = clamp(priorityScore + 5, 0, 100);
  }
  if (moneyExposure && dueSoon) {
    priorityScore = clamp(priorityScore + 6, 0, 100);
  }

  const signals: string[] = [];
  if (dueSoon) signals.push("due soon");
  if (quickWin) signals.push("quick win");
  if (moneyExposure) signals.push("money exposure");
  if (input.obligation.status === "POSTPONED") signals.push("recent activity");
  if (signals.length === 0) signals.push("high importance");

  const shouldTrigger = confidence >= 0.45 && priorityScore >= 58;

  const state =
    confidence >= 0.78 && priorityScore >= 76
      ? AutoFlowStateStatus.READY
      : AutoFlowStateStatus.SUGGESTED;

  const primaryReason =
    input.reasonHint ??
    (state === AutoFlowStateStatus.READY
      ? "Ready now"
      : dueSoon
        ? "Needs attention soon"
        : quickWin
          ? "Quick win opportunity"
          : "Recommended next step");

  return {
    shouldTrigger,
    state,
    confidenceScore: confidence,
    urgencyScore: urgency,
    priorityScore,
    primaryReason,
    signals
  };
}

function getPersonalizationWeight(input: {
  obligation: ReturnType<typeof mapObligation>;
  triggerType: AutoFlowTriggerType;
  signals: Awaited<ReturnType<PersonalizationService["getSignals"]>> | null;
}) {
  if (!input.signals) return 0;

  let weight = 0;
  if (input.obligation.effortLevel === "LOW" && input.signals.quickWinAffinity === "high") {
    weight += 8;
  }
  if (input.obligation.urgencyScore >= 80 && input.signals.urgencyResponsiveness === "low") {
    weight += 10;
  }
  if ((input.obligation.amount ?? 0) > 0 && input.signals.moneySensitivity === "low") {
    weight += 6;
  }
  if (
    input.obligation.type === "SUBSCRIPTION" &&
    input.signals.subscriptionPreferenceBias === "cancel_leaning"
  ) {
    weight -= 4;
  }
  if (
    input.triggerType === AutoFlowTriggerType.PATTERN_TRIGGER &&
    input.signals.journeyCompletionStyle === "usually_completes"
  ) {
    weight += 4;
  }

  return weight;
}

function buildWhy(
  row: AutoFlowWithRelations,
  obligation: ReturnType<typeof mapObligation>
): TrustWhy {
  const summary = asRecord(row.metadata);
  const signals = Array.isArray(summary?.signals)
    ? summary.signals.filter((value): value is string => typeof value === "string")
    : [];

  return {
    primaryReason: row.reason ?? "Recommended now",
    signals: signals.length > 0 ? signals : ["high importance"],
    confidence: toWhyConfidence(Number(row.confidenceScore)),
    personalizationReason:
      row.triggerType === AutoFlowTriggerType.PATTERN_TRIGGER
        ? "Based on your recent action pattern"
        : obligation.needsReview
          ? "Review suggested before acting"
          : null
  };
}

function isDueWithinHours(value: string | null | undefined, hours: number) {
  if (!value) return false;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() - Date.now() <= hours * 60 * 60 * 1000;
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value));
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
