import {
  DailyPulseItemStatus,
  ObligationStatus,
  ObligationType,
  Prisma
} from "@prisma/client";
import { DashboardInsightsService } from "./dashboard-insights.service";
import { TodayFeedService } from "./today-feed.service";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { prisma } from "../clients/prisma.client";
import { PersonalizationService } from "./personalization.service";
import type { PersonalizationSignals } from "../types/personalization.types";
import { DailyPulseRepository } from "../repositories/daily-pulse.repository";
import { AppError } from "../utils/app-error";

type PulseHookType = "urgent" | "quick_win" | "money" | "postponed" | "important";
type PulseTrend = "up" | "down" | "flat";

type PulseItem = {
  obligationId: string;
  title: string;
  whyItMatters: string;
  actionLabel: string;
  hookType: PulseHookType;
  priorityScore: number;
  status: "PENDING" | "OPENED_GUIDED";
};

type PulseProgress = {
  totalItems: number;
  completedCount: number;
  postponedCount: number;
  dismissedCount: number;
  remainingCount: number;
  progressPercent: number;
  isCompletedForNow: boolean;
  completedAt: string | null;
};

type PulseCandidate = {
  obligationId: string;
  title: string;
  type: ObligationType;
  status: ObligationStatus;
  urgencyScore: number;
  importanceScore: number;
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  amount: number | null;
  dueDate: string | null;
  priorityScore: number;
  isUrgent: boolean;
  isQuickWin: boolean;
  isMoney: boolean;
  isPostponed: boolean;
  hookType: PulseHookType;
};

const MAX_ITEMS = 5;
const LOOKBACK_DAYS = 7;

export class DailyPulseService {
  private readonly dashboardInsightsService = new DashboardInsightsService();
  private readonly todayFeedService = new TodayFeedService();
  private readonly obligationRepository = new ObligationRepository();
  private readonly personalizationService = new PersonalizationService();
  private readonly repository = new DailyPulseRepository();

  async getPulse(userId: string, options?: { markOpened?: boolean; refresh?: boolean }) {
    const markOpened = options?.markOpened ?? true;
    const refresh = options?.refresh ?? false;
    const todayKey = getDateKeyUTC(new Date());

    const [insights, todayFeed, activeObligations, recentlyPostponedIds, personalizationSummary] =
      await Promise.all([
        this.dashboardInsightsService.getInsights(userId),
        this.todayFeedService.getTodayFeed(userId),
        this.obligationRepository.findActiveForFeed(userId),
        this.getRecentlyPostponedIds(userId),
        this.personalizationService.getSummary(userId).catch(() => null)
      ]);
    const signals = personalizationSummary?.signals ?? getDefaultSignals();

    const feedByObligationId = new Map(todayFeed.items.map((item) => [item.obligationId, item]));

    const candidates = activeObligations.map((raw) => {
      const obligation = mapObligation(raw);
      const dueDate = obligation.dueDate;
      const basePriorityScore = computePriorityScore(obligation);
      const isUrgent = computeIsUrgent(obligation);
      const isQuickWin = computeIsQuickWin(obligation);
      const isMoney = typeof obligation.amount === "number" && obligation.amount > 0;
      const isPostponed =
        obligation.status === ObligationStatus.POSTPONED || recentlyPostponedIds.has(obligation.id);
      const hookType = resolveHookType({ isUrgent, isQuickWin, isMoney, isPostponed }, feedByObligationId.get(obligation.id)?.hookType);

      const personalization = this.personalizationService.getDailyPulseScoreAdjustment(signals, {
        obligationType: obligation.type,
        isUrgent,
        isQuickWin,
        isMoney,
        importanceScore: obligation.importanceScore,
        urgencyScore: obligation.urgencyScore
      });

      return {
        obligationId: obligation.id,
        title: obligation.title,
        type: obligation.type,
        status: obligation.status,
        urgencyScore: obligation.urgencyScore,
        importanceScore: obligation.importanceScore,
        effortLevel: obligation.effortLevel,
        impactLevel: obligation.impactLevel,
        amount: obligation.amount,
        dueDate,
        priorityScore: basePriorityScore + personalization.delta,
        isUrgent,
        isQuickWin,
        isMoney,
        isPostponed,
        hookType
      } satisfies PulseCandidate;
    });

    const selectedCandidates = this.selectPulseCandidates(candidates);

    const state = await this.ensureStateAndSeedItems({
      userId,
      dateKey: todayKey,
      markOpened,
      refresh,
      selectedCandidates
    });

    await this.reconcileItemStatuses(state.id);
    const itemStates = await this.repository.listItemStates(state.id);
    const progress = await this.syncProgress(state.id);
    const items = await this.buildActiveItems(itemStates, selectedCandidates, feedByObligationId);
    const momentum = await this.getMomentum(userId, progress.completedCount);

    return {
      generatedAt: state.createdAt.toISOString(),
      topInsight: {
        title: insights.topInsight.title,
        description: insights.topInsight.description,
        tone: insights.topInsight.tone
      },
      items,
      momentum: {
        ...momentum,
        completionMessage: buildCompletionMessage(progress, momentum)
      },
      progress,
      quickSummary: buildQuickSummary(items, progress, momentum),
      state: {
        date: state.date,
        openedAt: state.openedAt?.toISOString() ?? null,
        completedCount: progress.completedCount,
        postponedCount: progress.postponedCount,
        dismissedCount: progress.dismissedCount,
        totalItems: progress.totalItems,
        isCompletedForNow: progress.isCompletedForNow,
        completedAt: progress.completedAt
      }
    };
  }

  async openPulse(userId: string) {
    const todayKey = getDateKeyUTC(new Date());
    let state = await this.repository.findStateByDate(userId, todayKey);

    if (!state) {
      state = await this.repository.createState({
        userId,
        date: todayKey,
        openedAt: new Date()
      });

      await this.repository.createAuditEvent({
        userId,
        eventType: "daily_pulse_opened",
        metadata: {
          date: todayKey,
          firstOpen: true
        }
      });
    } else if (!state.openedAt) {
      state = await this.repository.updateState(state.id, {
        openedAt: new Date()
      });

      await this.repository.createAuditEvent({
        userId,
        eventType: "daily_pulse_opened",
        metadata: {
          date: todayKey,
          firstOpen: false
        }
      });
    }

    await this.reconcileItemStatuses(state.id);
    const progress = await this.syncProgress(state.id);
    const momentum = await this.getMomentum(userId, progress.completedCount);

    return {
      date: todayKey,
      openedAt: state.openedAt?.toISOString() ?? null,
      progress,
      momentum: {
        ...momentum,
        completionMessage: buildCompletionMessage(progress, momentum)
      }
    };
  }

  async getPulseState(userId: string) {
    const todayKey = getDateKeyUTC(new Date());

    const state = await this.repository.findStateByDate(userId, todayKey);
    if (!state) {
      return {
        date: todayKey,
        openedToday: false,
        openedAt: null,
        completedCount: 0,
        postponedCount: 0,
        dismissedCount: 0,
        totalItems: 0,
        isCompletedForNow: false,
        completedAt: null
      };
    }

    await this.reconcileItemStatuses(state.id);
    const progress = await this.syncProgress(state.id);

    return {
      date: todayKey,
      openedToday: Boolean(state.openedAt),
      openedAt: state.openedAt?.toISOString() ?? null,
      completedCount: progress.completedCount,
      postponedCount: progress.postponedCount,
      dismissedCount: progress.dismissedCount,
      totalItems: progress.totalItems,
      isCompletedForNow: progress.isCompletedForNow,
      completedAt: progress.completedAt
    };
  }

  async getProgress(userId: string) {
    const todayKey = getDateKeyUTC(new Date());
    const state = await this.repository.findStateByDate(userId, todayKey);

    if (!state) {
      const momentum = await this.getMomentum(userId, 0);
      const emptyProgress: PulseProgress = {
        totalItems: 0,
        completedCount: 0,
        postponedCount: 0,
        dismissedCount: 0,
        remainingCount: 0,
        progressPercent: 0,
        isCompletedForNow: false,
        completedAt: null
      };

      return {
        progress: emptyProgress,
        momentum: {
          ...momentum,
          completionMessage: buildCompletionMessage(emptyProgress, momentum)
        }
      };
    }

    await this.reconcileItemStatuses(state.id);
    const progress = await this.syncProgress(state.id);
    const momentum = await this.getMomentum(userId, progress.completedCount);

    return {
      progress,
      momentum: {
        ...momentum,
        completionMessage: buildCompletionMessage(progress, momentum)
      }
    };
  }

  async markItemCompleted(userId: string, obligationId: string, sourceType = "pulse_action") {
    return this.updateItemStatus(userId, obligationId, DailyPulseItemStatus.COMPLETED, {
      sourceType,
      strict: true,
      auditEventType: "daily_pulse_item_completed"
    });
  }

  async markItemPostponed(userId: string, obligationId: string, sourceType = "pulse_action") {
    return this.updateItemStatus(userId, obligationId, DailyPulseItemStatus.POSTPONED, {
      sourceType,
      strict: true,
      auditEventType: "daily_pulse_item_postponed"
    });
  }

  async markItemDismissed(userId: string, obligationId: string, sourceType = "pulse_action") {
    return this.updateItemStatus(userId, obligationId, DailyPulseItemStatus.DISMISSED, {
      sourceType,
      strict: true,
      auditEventType: "daily_pulse_item_dismissed"
    });
  }

  async markItemOpenedGuided(userId: string, obligationId: string, sourceType = "pulse_action") {
    return this.updateItemStatus(userId, obligationId, DailyPulseItemStatus.OPENED_GUIDED, {
      sourceType,
      strict: true,
      auditEventType: "daily_pulse_item_opened_guided"
    });
  }

  async markCompletedFromGuidedJourney(userId: string, obligationId: string) {
    return this.updateItemStatus(userId, obligationId, DailyPulseItemStatus.COMPLETED, {
      sourceType: "guided_journey_completion",
      strict: false,
      auditEventType: "daily_pulse_item_completed_via_guided"
    });
  }

  async trackAction(userId: string, action: "COMPLETED" | "DISMISSED" | "POSTPONED") {
    const todayKey = getDateKeyUTC(new Date());
    const state = await this.repository.findStateByDate(userId, todayKey);

    if (!state) {
      return {
        date: todayKey,
        openedAt: null,
        completedCount: 0,
        postponedCount: 0,
        dismissedCount: 0,
        totalItems: 0,
        isCompletedForNow: false,
        completedAt: null
      };
    }

    await this.reconcileItemStatuses(state.id);
    const progress = await this.syncProgress(state.id);

    return {
      date: state.date,
      openedAt: state.openedAt?.toISOString() ?? null,
      completedCount: progress.completedCount,
      postponedCount: progress.postponedCount,
      dismissedCount: progress.dismissedCount,
      totalItems: progress.totalItems,
      isCompletedForNow: progress.isCompletedForNow,
      completedAt: progress.completedAt
    };
  }

  private async ensureStateAndSeedItems(input: {
    userId: string;
    dateKey: string;
    markOpened: boolean;
    refresh: boolean;
    selectedCandidates: PulseCandidate[];
  }) {
    const { userId, dateKey, markOpened, refresh, selectedCandidates } = input;

    let state = await this.repository.findStateByDate(userId, dateKey);

    if (!state) {
      state = await this.repository.createState({
        userId,
        date: dateKey,
        openedAt: markOpened ? new Date() : null
      });

      await this.repository.createAuditEvent({
        userId,
        eventType: "daily_pulse_created",
        metadata: {
          date: dateKey,
          totalCandidates: selectedCandidates.length
        }
      });

      if (markOpened) {
        await this.repository.createAuditEvent({
          userId,
          eventType: "daily_pulse_opened",
          metadata: {
            date: dateKey,
            firstOpen: true
          }
        });
      }
    } else if (markOpened && !state.openedAt) {
      state = await this.repository.updateState(state.id, {
        openedAt: new Date()
      });

      await this.repository.createAuditEvent({
        userId,
        eventType: "daily_pulse_opened",
        metadata: {
          date: dateKey,
          firstOpen: false
        }
      });
    }

    const existingItems = await this.repository.listItemStates(state.id);

    const shouldSeed = existingItems.length === 0 || refresh;
    if (shouldSeed) {
      const existingIds = new Set(existingItems.map((item) => item.obligationId));
      const candidatesToAdd = selectedCandidates
        .filter((candidate) => !existingIds.has(candidate.obligationId))
        .slice(0, Math.max(0, MAX_ITEMS - existingItems.length));

      if (candidatesToAdd.length > 0) {
        await this.repository.runInTransaction(async (tx) => {
          for (const candidate of candidatesToAdd) {
            await this.repository.createItemState(
              {
                dailyPulseStateId: state.id,
                userId,
                obligationId: candidate.obligationId,
                hookType: candidate.hookType,
                sourceType: "daily_pulse_seed"
              },
              tx
            );
          }

          await this.repository.createAuditEvent(
            {
              userId,
              eventType: "daily_pulse_seeded",
              metadata: {
                date: dateKey,
                addedItems: candidatesToAdd.length,
                refresh
              }
            },
            tx
          );
        });
      }
    }

    return state;
  }

  private async buildActiveItems(
    itemStates: Array<{
      obligationId: string;
      status: DailyPulseItemStatus;
      hookType: string | null;
      createdAt: Date;
    }>,
    candidates: PulseCandidate[],
    feedByObligationId: Map<
      string,
      { whyItMatters: string; hookType: "urgent" | "money" | "quick_win" | "none" }
    >
  ): Promise<PulseItem[]> {
    const activeItemStates = itemStates.filter(
      (item) => item.status === DailyPulseItemStatus.PENDING || item.status === DailyPulseItemStatus.OPENED_GUIDED
    );

    if (activeItemStates.length === 0) {
      return [];
    }

    const candidateById = new Map(candidates.map((item) => [item.obligationId, item]));

    const obligations = await prisma.obligation.findMany({
      where: {
        id: {
          in: activeItemStates.map((item) => item.obligationId)
        }
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        amount: true
      }
    });
    const obligationById = new Map(obligations.map((item) => [item.id, item]));

    return activeItemStates
      .map((state) => {
        const candidate = candidateById.get(state.obligationId);
        const feed = feedByObligationId.get(state.obligationId);
        const obligation = obligationById.get(state.obligationId);

        const hookType = normalizeHookType(state.hookType) ?? candidate?.hookType ?? "important";

        return {
          obligationId: state.obligationId,
          title: candidate?.title ?? obligation?.title ?? "Untitled obligation",
          whyItMatters:
            feed?.whyItMatters ??
            buildFallbackWhy(
              {
                dueDate: candidate?.dueDate ?? obligation?.dueDate?.toISOString() ?? null,
                amount: candidate?.amount ?? (typeof obligation?.amount === "number" ? obligation.amount : null)
              },
              hookType
            ),
          actionLabel: "Start",
          hookType,
          priorityScore: candidate?.priorityScore ?? 0,
          status:
            state.status === DailyPulseItemStatus.OPENED_GUIDED
              ? "OPENED_GUIDED"
              : "PENDING"
        } satisfies PulseItem;
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, MAX_ITEMS);
  }

  private selectPulseCandidates(candidates: PulseCandidate[]) {
    const sortedByPriority = [...candidates].sort((a, b) => b.priorityScore - a.priorityScore);
    const selected: PulseCandidate[] = [];
    const seen = new Set<string>();

    const addFrom = (pool: PulseCandidate[], maxCount: number) => {
      let added = 0;
      for (const candidate of pool) {
        if (selected.length >= MAX_ITEMS) break;
        if (added >= maxCount) break;
        if (seen.has(candidate.obligationId)) continue;
        selected.push(candidate);
        seen.add(candidate.obligationId);
        added += 1;
      }
    };

    addFrom(sortedByPriority.filter((item) => item.isUrgent), 2);
    addFrom(sortedByPriority.filter((item) => item.isQuickWin), 2);
    addFrom(sortedByPriority.filter((item) => item.isMoney), 1);
    addFrom(sortedByPriority, MAX_ITEMS);

    return selected.slice(0, MAX_ITEMS);
  }

  private async updateItemStatus(
    userId: string,
    obligationId: string,
    nextStatus: DailyPulseItemStatus,
    options: {
      sourceType: string;
      strict: boolean;
      auditEventType: string;
    }
  ) {
    const todayKey = getDateKeyUTC(new Date());
    const state = await this.repository.findStateByDate(userId, todayKey);

    if (!state) {
      if (!options.strict) return null;
      throw new AppError("NOT_FOUND", "Daily pulse state not found for today", 404);
    }

    const item = await this.repository.findItemState(state.id, obligationId);

    if (!item) {
      if (!options.strict) return null;
      throw new AppError("NOT_FOUND", "Obligation is not part of today's pulse", 404);
    }

    const targetStatus = resolveNextStatus(item.status, nextStatus);

    let didChange = false;
    if (targetStatus !== item.status) {
      didChange = true;
      await this.repository.runInTransaction(async (tx) => {
        await this.repository.updateItemStateStatus(state.id, obligationId, targetStatus, tx);

        await this.repository.createAuditEvent(
          {
            userId,
            obligationId,
            eventType: options.auditEventType,
            metadata: {
              date: todayKey,
              previousStatus: item.status,
              nextStatus: targetStatus,
              sourceType: options.sourceType
            }
          },
          tx
        );
      });
    }

    const progress = await this.syncProgress(state.id);
    const momentum = await this.getMomentum(userId, progress.completedCount);

    return {
      obligationId,
      status: targetStatus,
      didChange,
      progress,
      momentum: {
        ...momentum,
        completionMessage: buildCompletionMessage(progress, momentum)
      }
    };
  }

  private async syncProgress(stateId: string): Promise<PulseProgress> {
    const counts = await this.repository.countByStatus(stateId);

    const totalItems =
      counts.PENDING + counts.OPENED_GUIDED + counts.COMPLETED + counts.POSTPONED + counts.DISMISSED;
    const completedCount = counts.COMPLETED;
    const postponedCount = counts.POSTPONED;
    const dismissedCount = counts.DISMISSED;
    const remainingCount = counts.PENDING + counts.OPENED_GUIDED;
    const handledCount = completedCount + postponedCount + dismissedCount;
    const progressPercent = totalItems === 0 ? 0 : Math.round((handledCount / totalItems) * 100);
    const isCompletedForNow = totalItems > 0 && remainingCount === 0;

    const existingState = await prisma.dailyPulseState.findFirst({
      where: {
        id: stateId
      },
      select: {
        isCompletedForNow: true,
        completedAt: true
      }
    });

    const completedAt =
      isCompletedForNow && !existingState?.completedAt ? new Date() : isCompletedForNow ? existingState?.completedAt : null;

    await this.repository.updateState(stateId, {
      totalItems,
      completedCount,
      postponedCount,
      dismissedCount,
      isCompletedForNow,
      completedAt
    });

    if (existingState && !existingState.isCompletedForNow && isCompletedForNow) {
      const state = await prisma.dailyPulseState.findFirst({
        where: { id: stateId },
        select: {
          userId: true,
          date: true
        }
      });

      if (state) {
        await this.repository.createAuditEvent({
          userId: state.userId,
          eventType: "daily_pulse_completed_for_now",
          metadata: {
            date: state.date,
            totalItems,
            completedCount,
            postponedCount,
            dismissedCount
          }
        });
      }
    }

    return {
      totalItems,
      completedCount,
      postponedCount,
      dismissedCount,
      remainingCount,
      progressPercent,
      isCompletedForNow,
      completedAt: completedAt?.toISOString() ?? null
    };
  }

  private async reconcileItemStatuses(stateId: string) {
    const state = await prisma.dailyPulseState.findUnique({
      where: { id: stateId },
      select: {
        userId: true,
        date: true
      }
    });
    if (!state) return;

    const itemStates = await this.repository.listItemStates(stateId);
    const pendingItems = itemStates.filter(
      (item) =>
        item.status === DailyPulseItemStatus.PENDING ||
        item.status === DailyPulseItemStatus.OPENED_GUIDED
    );
    if (pendingItems.length === 0) return;

    const obligations = await prisma.obligation.findMany({
      where: {
        id: {
          in: pendingItems.map((item) => item.obligationId)
        }
      },
      select: {
        id: true,
        status: true
      }
    });
    const statusByObligationId = new Map(obligations.map((item) => [item.id, item.status]));

    const updates: Array<{
      obligationId: string;
      fromStatus: DailyPulseItemStatus;
      toStatus: DailyPulseItemStatus;
      reason: string;
    }> = [];

    for (const item of pendingItems) {
      const obligationStatus = statusByObligationId.get(item.obligationId);
      if (obligationStatus === ObligationStatus.RESOLVED) {
        updates.push({
          obligationId: item.obligationId,
          fromStatus: item.status,
          toStatus: DailyPulseItemStatus.COMPLETED,
          reason: "obligation_resolved"
        });
      } else if (obligationStatus === ObligationStatus.POSTPONED) {
        updates.push({
          obligationId: item.obligationId,
          fromStatus: item.status,
          toStatus: DailyPulseItemStatus.POSTPONED,
          reason: "obligation_postponed"
        });
      } else if (obligationStatus === ObligationStatus.IGNORED) {
        updates.push({
          obligationId: item.obligationId,
          fromStatus: item.status,
          toStatus: DailyPulseItemStatus.DISMISSED,
          reason: "obligation_ignored"
        });
      }
    }

    if (updates.length === 0) return;

    await this.repository.runInTransaction(async (tx) => {
      for (const update of updates) {
        await this.repository.updateItemStateStatus(
          stateId,
          update.obligationId,
          update.toStatus,
          tx
        );

        await this.repository.createAuditEvent(
          {
            userId: state.userId,
            obligationId: update.obligationId,
            eventType: "daily_pulse_item_reconciled",
            metadata: {
              date: state.date,
              reason: update.reason,
              previousStatus: update.fromStatus,
              nextStatus: update.toStatus
            }
          },
          tx
        );
      }
    });
  }

  private async getMomentum(userId: string, todayCompleted: number) {
    const now = new Date();
    const currentWindowStart = daysAgo(now, LOOKBACK_DAYS);
    const previousWindowStart = daysAgo(currentWindowStart, LOOKBACK_DAYS);

    const [handledThisWeek, handledPreviousWeek] = await Promise.all([
      prisma.obligation.count({
        where: {
          userId,
          status: ObligationStatus.RESOLVED,
          lastActedAt: {
            gte: currentWindowStart,
            lte: now
          }
        }
      }),
      prisma.obligation.count({
        where: {
          userId,
          status: ObligationStatus.RESOLVED,
          lastActedAt: {
            gte: previousWindowStart,
            lt: currentWindowStart
          }
        }
      })
    ]);

    const trend: PulseTrend =
      handledThisWeek > handledPreviousWeek
        ? "up"
        : handledThisWeek < handledPreviousWeek
          ? "down"
          : "flat";

    return {
      handledThisWeek,
      todayCompleted,
      trend
    };
  }

  private async getRecentlyPostponedIds(userId: string) {
    const recentWindowStart = daysAgo(new Date(), LOOKBACK_DAYS);

    const events = await prisma.auditEvent.findMany({
      where: {
        userId,
        eventType: "obligation_postponed",
        createdAt: {
          gte: recentWindowStart
        }
      },
      select: {
        obligationId: true
      }
    });

    const ids = new Set<string>();
    for (const item of events) {
      if (item.obligationId) {
        ids.add(item.obligationId);
      }
    }
    return ids;
  }
}

function resolveNextStatus(current: DailyPulseItemStatus, requested: DailyPulseItemStatus) {
  if (requested === DailyPulseItemStatus.OPENED_GUIDED) {
    if (current === DailyPulseItemStatus.PENDING || current === DailyPulseItemStatus.OPENED_GUIDED) {
      return DailyPulseItemStatus.OPENED_GUIDED;
    }
    return current;
  }

  if (
    requested === DailyPulseItemStatus.COMPLETED ||
    requested === DailyPulseItemStatus.POSTPONED ||
    requested === DailyPulseItemStatus.DISMISSED
  ) {
    return requested;
  }

  return current;
}

function normalizeHookType(value: string | null | undefined): PulseHookType | null {
  if (!value) return null;
  if (value === "urgent") return "urgent";
  if (value === "quick_win") return "quick_win";
  if (value === "money") return "money";
  if (value === "postponed") return "postponed";
  if (value === "important") return "important";
  return null;
}

function computePriorityScore(item: {
  urgencyScore: number;
  importanceScore: number;
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  amount: number | null;
  dueDate: string | null;
  status: ObligationStatus;
}) {
  const effortBonus = item.effortLevel === "LOW" ? 8 : item.effortLevel === "MEDIUM" ? 3 : 0;
  const impactBonus = item.impactLevel === "HIGH" ? 8 : item.impactLevel === "MEDIUM" ? 4 : 0;
  const moneyBonus = item.amount && item.amount > 0 ? 6 : 0;
  const postponedBonus = item.status === "POSTPONED" ? 5 : 0;
  const dueSoonBonus = isDueWithinHours(item.dueDate, 48) ? 12 : 0;

  const raw = item.urgencyScore * 0.45 + item.importanceScore * 0.35;
  return Math.round(raw + effortBonus + impactBonus + moneyBonus + postponedBonus + dueSoonBonus);
}

function computeIsUrgent(item: {
  dueDate: string | null;
  urgencyScore: number;
}) {
  return isDueWithinHours(item.dueDate, 48) || item.urgencyScore >= 85;
}

function computeIsQuickWin(item: {
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  importanceScore: number;
  status: ObligationStatus;
}) {
  return (
    item.status === "ACTIVE" &&
    item.effortLevel === "LOW" &&
    (item.impactLevel === "MEDIUM" || item.impactLevel === "HIGH") &&
    item.importanceScore >= 50
  );
}

function isDueWithinHours(value: string | null, hours: number) {
  if (!value) return false;
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) return false;
  const now = Date.now();
  return dueDate.getTime() <= now + hours * 60 * 60 * 1000;
}

function resolveHookType(
  item: {
    isUrgent: boolean;
    isQuickWin: boolean;
    isMoney: boolean;
    isPostponed: boolean;
  },
  feedHook?: "urgent" | "money" | "quick_win" | "none"
): PulseHookType {
  if (feedHook === "urgent" || item.isUrgent) return "urgent";
  if (feedHook === "quick_win" || item.isQuickWin) return "quick_win";
  if (feedHook === "money" || item.isMoney) return "money";
  if (item.isPostponed) return "postponed";
  return "important";
}

function buildFallbackWhy(
  item: {
    dueDate: string | null;
    amount: number | null;
  },
  hookType: PulseHookType
) {
  if (hookType === "urgent") {
    return "This likely needs attention soon.";
  }

  if (hookType === "quick_win") {
    return "Low effort and worth clearing now.";
  }

  if (hookType === "money") {
    if (item.amount && item.amount > 0) {
      return "This may affect your spending soon.";
    }
    return "Money-related item worth reviewing now.";
  }

  if (hookType === "postponed") {
    return "You postponed this recently and may want to revisit it.";
  }

  if (item.dueDate) {
    return "This is important and has a scheduled due date.";
  }

  return "This is a high-value item to decide today.";
}

function buildQuickSummary(
  items: PulseItem[],
  progress: PulseProgress,
  momentum: { handledThisWeek: number; todayCompleted: number; trend: PulseTrend }
) {
  if (progress.totalItems === 0) {
    return "You're all caught up today.";
  }

  if (progress.isCompletedForNow) {
    return "You handled today's pulse and are done for now.";
  }

  if (progress.remainingCount === 1) {
    return "One item left in today's pulse.";
  }

  const urgentCount = items.filter((item) => item.hookType === "urgent").length;
  if (urgentCount > 0) {
    return `${urgentCount} urgent ${pluralize("item", urgentCount)} and ${Math.max(0, progress.remainingCount - urgentCount)} other priorities remain.`;
  }

  return buildCompletionMessage(progress, momentum);
}

function buildCompletionMessage(
  progress: PulseProgress,
  momentum: { handledThisWeek: number; todayCompleted: number; trend: PulseTrend }
) {
  if (progress.isCompletedForNow) {
    return "You're done for now.";
  }

  if (progress.totalItems === 0) {
    return "No pulse items yet today.";
  }

  if (momentum.todayCompleted > 0) {
    return `You handled ${momentum.todayCompleted} ${pluralize("item", momentum.todayCompleted)} today.`;
  }

  if (momentum.trend === "up") {
    return "Momentum is building this week.";
  }

  if (progress.remainingCount > 0) {
    return `${progress.remainingCount} ${pluralize("item", progress.remainingCount)} still in today's pulse.`;
  }

  return "Pulse updated.";
}

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}

function getDateKeyUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
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
