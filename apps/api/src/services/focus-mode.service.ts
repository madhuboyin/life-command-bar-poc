import {
  FocusSessionItemStatus,
  FocusSessionState,
  FlowSourceType
} from "@prisma/client";
import { z } from "zod";
import { FeedbackRepository } from "../repositories/feedback.repository";
import {
  FocusModeRepository,
  type FocusSessionWithRelations
} from "../repositories/focus-mode.repository";
import { ObligationRepository } from "../repositories/obligation.repository";
import type { PersonalizationSignals } from "../types/personalization.types";
import { mapObligation } from "../utils/obligation.mapper";
import { AppError } from "../utils/app-error";
import { estimateFocusMinutes } from "./focus-mode.estimator";
import {
  selectFocusItems,
  type FocusDurationMinutes
} from "./focus-mode.selector";
import { PersonalizationService } from "./personalization.service";

const createFocusSessionSchema = z.object({
  userId: z.string().min(1),
  durationMinutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  sourceType: z
    .enum([
      "DAILY_PULSE",
      "TODAY_FEED",
      "DASHBOARD",
      "OBLIGATION_DETAIL",
      "AUTO_FLOW",
      "FOCUS_MODE"
    ])
    .optional()
});

const postponeSchema = z.object({
  until: z.string().datetime().optional(),
  reason: z.string().optional()
});

const dismissSchema = z.object({
  reason: z.string().optional()
});

type FocusSessionItemPayload = {
  id: string;
  obligationId: string;
  title: string;
  whyIncluded: string;
  estimatedMinutes: number;
  priorityScore: number;
  status: FocusSessionItemStatus;
  sourceType: "EMAIL" | "UPLOAD" | "COMMAND" | "MANUAL";
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  needsReview: boolean;
  obligation: ReturnType<typeof mapObligation>;
};

type FocusSessionPayload = {
  id: string;
  durationMinutes: number;
  state: FocusSessionState;
  totalItems: number;
  completedCount: number;
  postponedCount: number;
  dismissedCount: number;
  skippedCount: number;
  remainingCount: number;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    line: string;
    completionMessage: string | null;
  };
  currentItem: FocusSessionItemPayload | null;
  items: FocusSessionItemPayload[];
};

export class FocusModeService {
  private readonly repository = new FocusModeRepository();
  private readonly feedbackRepository = new FeedbackRepository();
  private readonly obligationRepository = new ObligationRepository();
  private readonly personalizationService = new PersonalizationService();

  async createSession(payload: unknown) {
    const input = createFocusSessionSchema.parse(payload);
    const existing = await this.repository.findActiveForUser(input.userId);

    if (existing) {
      const synced = await this.syncSessionState(input.userId, existing.id);
      if (synced && getRemainingCount(synced) > 0) {
        return {
          resumedExisting: true,
          session: this.toPayload(synced)
        };
      }
    }

    const selected = await this.buildSelection(input.userId, input.durationMinutes);

    const created = await this.repository.runInTransaction(async (tx) => {
      const session = await this.repository.createSession(
        {
          userId: input.userId,
          durationMinutes: input.durationMinutes,
          sourceType: input.sourceType ?? FlowSourceType.FOCUS_MODE,
          items: selected.map((item, index) => ({
            obligationId: item.obligationId,
            position: index,
            whyIncluded: item.whyIncluded,
            estimatedMinutes: item.estimatedMinutes,
            priorityScore: item.priorityScore
          }))
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId: input.userId,
          eventType: "focus_session_created",
          metadata: {
            focusSessionId: session.id,
            durationMinutes: input.durationMinutes,
            totalItems: selected.length,
            obligationIds: selected.map((item) => item.obligationId)
          }
        },
        tx
      );

      return session;
    });

    const synced = await this.syncSessionState(input.userId, created.id);
    if (!synced) {
      throw new AppError("NOT_FOUND", "Focus session not found", 404);
    }

    return {
      resumedExisting: false,
      session: this.toPayload(synced)
    };
  }

  async getActiveSession(userId: string) {
    const existing = await this.repository.findActiveForUser(userId);
    if (!existing) return null;
    const synced = await this.syncSessionState(userId, existing.id);
    if (!synced) return null;
    return {
      session: this.toPayload(synced)
    };
  }

  async getById(userId: string, sessionId: string) {
    const synced = await this.syncSessionState(userId, sessionId);
    if (!synced) return null;

    return {
      session: this.toPayload(synced)
    };
  }

  async startSession(userId: string, sessionId: string) {
    const session = await this.requireSession(userId, sessionId);
    if (session.state !== FocusSessionState.ACTIVE) {
      return {
        session: this.toPayload(session)
      };
    }

    await this.repository.runInTransaction(async (tx) => {
      if (!session.startedAt) {
        await this.repository.updateSession(
          session.id,
          {
            startedAt: new Date()
          },
          tx
        );

        await this.repository.createAuditEvent(
          {
            userId,
            eventType: "focus_session_started",
            metadata: {
              focusSessionId: session.id
            }
          },
          tx
        );
      }

      const inProgress = await this.repository.findCurrentInProgressItem(
        { sessionId: session.id, userId },
        tx
      );
      if (!inProgress) {
        const firstPending = await this.repository.findFirstPendingItem(
          { sessionId: session.id, userId },
          tx
        );
        if (firstPending) {
          await this.repository.updateItemById(
            firstPending.id,
            {
              status: FocusSessionItemStatus.IN_PROGRESS
            },
            tx
          );
        }
      }
    });

    const synced = await this.syncSessionState(userId, sessionId);
    if (!synced) throw new AppError("NOT_FOUND", "Focus session not found", 404);

    return {
      session: this.toPayload(synced)
    };
  }

  async completeItem(userId: string, sessionId: string, obligationId: string) {
    const session = await this.requireActiveSession(userId, sessionId);
    const item = await this.requireSessionItem(userId, sessionId, obligationId);
    ensureItemActionable(item.status);

    const resolved = await this.obligationRepository.markDone(
      obligationId,
      userId,
      "Completed in Focus Mode"
    );
    if (!resolved) {
      throw new AppError("NOT_FOUND", "Obligation not found", 404);
    }

    await this.applyItemStatusUpdate({
      userId,
      sessionId: session.id,
      obligationId,
      status: FocusSessionItemStatus.COMPLETED,
      eventType: "focus_session_item_completed"
    });

    const synced = await this.syncSessionState(userId, session.id);
    if (!synced) throw new AppError("NOT_FOUND", "Focus session not found", 404);

    return {
      session: this.toPayload(synced)
    };
  }

  async postponeItem(
    userId: string,
    sessionId: string,
    obligationId: string,
    payload: unknown
  ) {
    const input = postponeSchema.parse(payload ?? {});
    const session = await this.requireActiveSession(userId, sessionId);
    const item = await this.requireSessionItem(userId, sessionId, obligationId);
    ensureItemActionable(item.status);

    const until = input.until ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const postponed = await this.obligationRepository.postpone(
      obligationId,
      userId,
      until,
      input.reason ?? "Postponed in Focus Mode"
    );
    if (!postponed) {
      throw new AppError("NOT_FOUND", "Obligation not found", 404);
    }

    await this.applyItemStatusUpdate({
      userId,
      sessionId: session.id,
      obligationId,
      status: FocusSessionItemStatus.POSTPONED,
      eventType: "focus_session_item_postponed",
      metadata: {
        until,
        reason: input.reason ?? null
      }
    });

    const synced = await this.syncSessionState(userId, session.id);
    if (!synced) throw new AppError("NOT_FOUND", "Focus session not found", 404);

    return {
      session: this.toPayload(synced)
    };
  }

  async dismissItem(
    userId: string,
    sessionId: string,
    obligationId: string,
    payload: unknown
  ) {
    const input = dismissSchema.parse(payload ?? {});
    const session = await this.requireActiveSession(userId, sessionId);
    const item = await this.requireSessionItem(userId, sessionId, obligationId);
    ensureItemActionable(item.status);

    const dismissed = await this.obligationRepository.dismiss(
      obligationId,
      userId,
      input.reason ?? "dismissed_from_focus_mode"
    );
    if (!dismissed) {
      throw new AppError("NOT_FOUND", "Obligation not found", 404);
    }

    await this.applyItemStatusUpdate({
      userId,
      sessionId: session.id,
      obligationId,
      status: FocusSessionItemStatus.DISMISSED,
      eventType: "focus_session_item_dismissed",
      metadata: {
        reason: input.reason ?? null
      }
    });

    const synced = await this.syncSessionState(userId, session.id);
    if (!synced) throw new AppError("NOT_FOUND", "Focus session not found", 404);

    return {
      session: this.toPayload(synced)
    };
  }

  async skipItem(userId: string, sessionId: string, obligationId: string) {
    const session = await this.requireActiveSession(userId, sessionId);
    const item = await this.requireSessionItem(userId, sessionId, obligationId);
    ensureItemActionable(item.status);

    await this.applyItemStatusUpdate({
      userId,
      sessionId: session.id,
      obligationId,
      status: FocusSessionItemStatus.SKIPPED,
      eventType: "focus_session_item_skipped"
    });

    const synced = await this.syncSessionState(userId, session.id);
    if (!synced) throw new AppError("NOT_FOUND", "Focus session not found", 404);

    return {
      session: this.toPayload(synced)
    };
  }

  async next(userId: string, sessionId: string) {
    const session = await this.requireActiveSession(userId, sessionId);

    await this.repository.runInTransaction(async (tx) => {
      const current = await this.repository.findCurrentInProgressItem(
        { sessionId: session.id, userId },
        tx
      );

      if (current) {
        await this.repository.updateItemById(
          current.id,
          {
            status: FocusSessionItemStatus.SKIPPED
          },
          tx
        );
      }

      const nextPending = await this.repository.findFirstPendingItem(
        { sessionId: session.id, userId },
        tx
      );
      if (nextPending) {
        await this.repository.updateItemById(
          nextPending.id,
          {
            status: FocusSessionItemStatus.IN_PROGRESS
          },
          tx
        );
      }

      await this.repository.createAuditEvent(
        {
          userId,
          eventType: "focus_session_moved_next",
          metadata: {
            focusSessionId: session.id,
            nextObligationId: nextPending?.obligationId ?? null
          }
        },
        tx
      );
    });

    const synced = await this.syncSessionState(userId, session.id);
    if (!synced) throw new AppError("NOT_FOUND", "Focus session not found", 404);

    return {
      session: this.toPayload(synced)
    };
  }

  async completeSession(userId: string, sessionId: string) {
    const session = await this.requireSession(userId, sessionId);
    if (session.state === FocusSessionState.COMPLETED) {
      return {
        session: this.toPayload(session)
      };
    }

    await this.repository.runInTransaction(async (tx) => {
      for (const item of session.items) {
        if (
          item.status === FocusSessionItemStatus.PENDING ||
          item.status === FocusSessionItemStatus.IN_PROGRESS
        ) {
          await this.repository.updateItemById(
            item.id,
            {
              status: FocusSessionItemStatus.SKIPPED
            },
            tx
          );
        }
      }

      await this.repository.updateSession(
        session.id,
        {
          state: FocusSessionState.COMPLETED,
          completedAt: new Date()
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          eventType: "focus_session_completed",
          metadata: {
            focusSessionId: session.id,
            forced: true
          }
        },
        tx
      );
    });

    const synced = await this.syncSessionState(userId, session.id);
    if (!synced) throw new AppError("NOT_FOUND", "Focus session not found", 404);

    return {
      session: this.toPayload(synced)
    };
  }

  async abandonSession(userId: string, sessionId: string) {
    const session = await this.requireSession(userId, sessionId);
    if (session.state === FocusSessionState.ABANDONED) {
      return {
        session: this.toPayload(session)
      };
    }

    const updated = await this.repository.runInTransaction(async (tx) => {
      const next = await this.repository.updateSession(
        session.id,
        {
          state: FocusSessionState.ABANDONED,
          abandonedAt: new Date()
        },
        tx
      );

      await this.repository.createAuditEvent(
        {
          userId,
          eventType: "focus_session_abandoned",
          metadata: {
            focusSessionId: session.id
          }
        },
        tx
      );

      return next;
    });

    return {
      session: this.toPayload(updated)
    };
  }

  private async buildSelection(userId: string, durationMinutes: FocusDurationMinutes) {
    const [rawItems, feedbackMap, personalizationSummary] = await Promise.all([
      this.repository.listObligationsForPlanning(userId),
      this.feedbackRepository.getRecentFeedbackMap(userId),
      this.personalizationService.getSummary(userId).catch(() => null)
    ]);
    const signals = personalizationSummary?.signals ?? getDefaultSignals();
    const mappedItems = rawItems.map((item) => mapObligation(item));

    const filtered = mappedItems.filter((item) => {
      const feedback = feedbackMap.get(item.id) ?? [];
      const suppressed =
        feedback.includes("DONT_SHOW_AGAIN") || feedback.includes("NOT_RELEVANT");
      const urgent =
        item.urgencyScore >= 90 ||
        Boolean(item.dueDate && new Date(item.dueDate).getTime() <= Date.now() + 24 * 60 * 60 * 1000);

      if (suppressed && !urgent) return false;
      if (item.status === "RESOLVED" || item.status === "IGNORED") return false;
      return true;
    });

    return selectFocusItems({
      durationMinutes,
      obligations: filtered,
      estimateMinutes: (estimateInput) => estimateFocusMinutes(estimateInput),
      getPersonalizationDelta: (scoreInput) =>
        this.personalizationService.getTodayFeedScoreAdjustment(signals, scoreInput)
    });
  }

  private async requireSession(userId: string, sessionId: string) {
    const session = await this.repository.findByIdForUser(userId, sessionId);
    if (!session) {
      throw new AppError("NOT_FOUND", "Focus session not found", 404);
    }
    return session;
  }

  private async requireActiveSession(userId: string, sessionId: string) {
    const session = await this.requireSession(userId, sessionId);
    if (session.state !== FocusSessionState.ACTIVE) {
      throw new AppError("INVALID_STATE", "Focus session is no longer active", 409);
    }
    return session;
  }

  private async requireSessionItem(userId: string, sessionId: string, obligationId: string) {
    const item = await this.repository.findItem({
      sessionId,
      userId,
      obligationId
    });
    if (!item) {
      throw new AppError("NOT_FOUND", "Item not found in this focus session", 404);
    }
    return item;
  }

  private async applyItemStatusUpdate(input: {
    userId: string;
    sessionId: string;
    obligationId: string;
    status: FocusSessionItemStatus;
    eventType: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.repository.runInTransaction(async (tx) => {
      await this.repository.updateItemStatus(
        {
          sessionId: input.sessionId,
          userId: input.userId,
          obligationId: input.obligationId,
          status: input.status
        },
        tx
      );

      const hasInProgress = await this.repository.findCurrentInProgressItem(
        { sessionId: input.sessionId, userId: input.userId },
        tx
      );
      if (!hasInProgress) {
        const nextPending = await this.repository.findFirstPendingItem(
          { sessionId: input.sessionId, userId: input.userId },
          tx
        );
        if (nextPending) {
          await this.repository.updateItemById(
            nextPending.id,
            {
              status: FocusSessionItemStatus.IN_PROGRESS
            },
            tx
          );
        }
      }

      await this.repository.createAuditEvent(
        {
          userId: input.userId,
          obligationId: input.obligationId,
          eventType: input.eventType,
          metadata: {
            focusSessionId: input.sessionId,
            status: input.status,
            ...(input.metadata ?? {})
          }
        },
        tx
      );
    });
  }

  private async syncSessionState(userId: string, sessionId: string) {
    const session = await this.repository.findByIdForUser(userId, sessionId);
    if (!session) return null;

    await this.repository.runInTransaction(async (tx) => {
      for (const item of session.items) {
        if (isTerminalItemStatus(item.status)) continue;

        const obligationStatus = item.obligation.status;
        if (obligationStatus === "RESOLVED") {
          await this.repository.updateItemById(
            item.id,
            {
              status: FocusSessionItemStatus.COMPLETED
            },
            tx
          );
          continue;
        }
        if (obligationStatus === "POSTPONED") {
          await this.repository.updateItemById(
            item.id,
            {
              status: FocusSessionItemStatus.POSTPONED
            },
            tx
          );
          continue;
        }
        if (obligationStatus === "IGNORED") {
          await this.repository.updateItemById(
            item.id,
            {
              status: FocusSessionItemStatus.DISMISSED
            },
            tx
          );
        }
      }
    });

    const refreshed = await this.repository.findByIdForUser(userId, sessionId);
    if (!refreshed) return null;

    const counts = countSessionItems(refreshed);
    const remainingCount = counts.pending + counts.inProgress;
    const nextState =
      refreshed.state === FocusSessionState.ACTIVE && remainingCount === 0
        ? FocusSessionState.COMPLETED
        : refreshed.state;
    const completedAt =
      nextState === FocusSessionState.COMPLETED
        ? refreshed.completedAt ?? new Date()
        : refreshed.completedAt;

    await this.repository.runInTransaction(async (tx) => {
      await this.repository.updateSession(
        refreshed.id,
        {
          totalItems: refreshed.items.length,
          completedCount: counts.completed,
          postponedCount: counts.postponed,
          dismissedCount: counts.dismissed,
          skippedCount: counts.skipped,
          state: nextState,
          completedAt
        },
        tx
      );

      const hasInProgress = refreshed.items.some(
        (item) => item.status === FocusSessionItemStatus.IN_PROGRESS
      );
      if (
        nextState === FocusSessionState.ACTIVE &&
        refreshed.startedAt &&
        !hasInProgress &&
        counts.pending > 0
      ) {
        const firstPending = await this.repository.findFirstPendingItem(
          { sessionId: refreshed.id, userId },
          tx
        );
        if (firstPending) {
          await this.repository.updateItemById(
            firstPending.id,
            {
              status: FocusSessionItemStatus.IN_PROGRESS
            },
            tx
          );
        }
      }
    });

    return this.repository.findByIdForUser(userId, sessionId);
  }

  private toPayload(session: FocusSessionWithRelations): FocusSessionPayload {
    const counts = countSessionItems(session);
    const remainingCount = counts.pending + counts.inProgress;
    const handledCount =
      counts.completed + counts.postponed + counts.dismissed + counts.skipped;
    const totalItems = session.items.length;
    const progressPercent = totalItems === 0 ? 100 : Math.round((handledCount / totalItems) * 100);

    const items: FocusSessionItemPayload[] = session.items.map((item) => {
      const obligation = mapObligation(item.obligation);
      return {
        id: item.id,
        obligationId: item.obligationId,
        title: obligation.title,
        whyIncluded: item.whyIncluded ?? "Fits this session.",
        estimatedMinutes: item.estimatedMinutes ?? estimateFocusMinutes({
          effortLevel: obligation.effortLevel,
          needsReview: obligation.needsReview,
          confidenceScore: obligation.confidenceScore
        }),
        priorityScore: item.priorityScore ? Number(item.priorityScore) : 0,
        status: item.status,
        sourceType: obligation.sourceType,
        confidenceBand: obligation.confidenceBand,
        needsReview: obligation.needsReview,
        obligation
      };
    });

    const currentItem =
      items.find((item) => item.status === FocusSessionItemStatus.IN_PROGRESS) ??
      items.find((item) => item.status === FocusSessionItemStatus.PENDING) ??
      null;

    return {
      id: session.id,
      durationMinutes: session.durationMinutes,
      state: session.state,
      totalItems,
      completedCount: counts.completed,
      postponedCount: counts.postponed,
      dismissedCount: counts.dismissed,
      skippedCount: counts.skipped,
      remainingCount,
      progressPercent,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      summary: {
        line: `${handledCount} of ${totalItems} handled`,
        completionMessage:
          session.state === FocusSessionState.COMPLETED
            ? `You cleared ${counts.completed} item${counts.completed === 1 ? "" : "s"} in ${session.durationMinutes} minutes.`
            : null
      },
      currentItem,
      items
    };
  }
}

function countSessionItems(session: FocusSessionWithRelations) {
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let postponed = 0;
  let dismissed = 0;
  let skipped = 0;

  for (const item of session.items) {
    if (item.status === FocusSessionItemStatus.PENDING) pending += 1;
    else if (item.status === FocusSessionItemStatus.IN_PROGRESS) inProgress += 1;
    else if (item.status === FocusSessionItemStatus.COMPLETED) completed += 1;
    else if (item.status === FocusSessionItemStatus.POSTPONED) postponed += 1;
    else if (item.status === FocusSessionItemStatus.DISMISSED) dismissed += 1;
    else if (item.status === FocusSessionItemStatus.SKIPPED) skipped += 1;
  }

  return {
    pending,
    inProgress,
    completed,
    postponed,
    dismissed,
    skipped
  };
}

function getRemainingCount(session: FocusSessionWithRelations) {
  const counts = countSessionItems(session);
  return counts.pending + counts.inProgress;
}

function isTerminalItemStatus(status: FocusSessionItemStatus) {
  return (
    status === FocusSessionItemStatus.COMPLETED ||
    status === FocusSessionItemStatus.POSTPONED ||
    status === FocusSessionItemStatus.DISMISSED ||
    status === FocusSessionItemStatus.SKIPPED
  );
}

function ensureItemActionable(status: FocusSessionItemStatus) {
  if (isTerminalItemStatus(status)) {
    throw new AppError("INVALID_STATE", "Item is already handled in this session", 409);
  }
}

function getDefaultSignals(): PersonalizationSignals {
  return {
    subscriptionPreferenceBias: "balanced",
    postponementPattern: "none",
    quickWinAffinity: "medium",
    urgencyResponsiveness: "medium",
    moneySensitivity: "review_first",
    journeyCompletionStyle: "mixed",
    reminderReliance: "low"
  };
}
