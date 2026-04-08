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
import type { DecisionTrace, TrustWhy } from "../utils/trust-layer";
import { toWhyConfidence } from "../utils/trust-layer";
import { HomeMemoryService } from "./home-memory.service";
import { PredictionEngineService } from "./prediction-engine.service";
import { SubscriptionInsightService } from "./subscription-insight.service";
import { PersonalizationSignalService } from "./personalization-signal.service";
import { BehaviorProfileService } from "./behavior-profile.service";

type PulseHookType = "urgent" | "quick_win" | "money" | "postponed" | "important";
type PulseTrend = "up" | "down" | "flat";

type PulseItem = {
  obligationId: string;
  title: string;
  sourceType: "EMAIL" | "UPLOAD" | "COMMAND" | "MANUAL";
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  needsReview: boolean;
  why: TrustWhy;
  whyItMatters: string;
  actionLabel: string;
  hookType: PulseHookType;
  priorityScore: number;
  status: "PENDING" | "OPENED_GUIDED";
  decisionTrace?: DecisionTrace;
  autoFlow: {
    id: string;
    triggerType: string;
    state: string;
    priorityScore: number;
    ctaLabel: string;
  } | null;
};

type PulsePredictionPreview = {
  id: string;
  title: string;
  description: string | null;
  predictedDate: string | null;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  rationaleSummary: string | null;
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

type PulseSubscriptionSignalItem = {
  subscriptionId: string;
  title: string;
  insightType: string;
  insightTitle: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  recommendationType: string;
  healthScore: number;
  nextRenewalDate: string | null;
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
  confidenceScore: number;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  sourceType: "EMAIL" | "UPLOAD" | "COMMAND" | "MANUAL";
  needsReview: boolean;
  priorityScore: number;
  isUrgent: boolean;
  isQuickWin: boolean;
  isMoney: boolean;
  isPostponed: boolean;
  hookType: PulseHookType;
  autoFlow: {
    id: string;
    triggerType: string;
    state: string;
    priorityScore: number;
    ctaLabel: string;
  } | null;
  predictionBoost: number;
  predictionReason: string | null;
  obligationIntelligence: {
    category: string;
    priorityBand: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
    surfacingTarget: "PULSE" | "CONTROL_TOWER_READY" | "CONTROL_TOWER_REVIEW" | "UPCOMING" | "SUPPRESS";
    priorityScore: number;
  } | null;
};

const MAX_ITEMS = 5;
const LOOKBACK_DAYS = 7;

export class DailyPulseService {
  private readonly dashboardInsightsService = new DashboardInsightsService();
  private readonly todayFeedService = new TodayFeedService();
  private readonly obligationRepository = new ObligationRepository();
  private readonly personalizationService = new PersonalizationService();
  private readonly repository = new DailyPulseRepository();
  private readonly homeMemoryService = new HomeMemoryService();
  private readonly predictionEngineService = new PredictionEngineService();
  private readonly subscriptionInsightService = new SubscriptionInsightService();
  private readonly personalizationSignalService = new PersonalizationSignalService();
  private readonly behaviorProfileService = new BehaviorProfileService();

  async getPulse(
    userId: string,
    options?: { markOpened?: boolean; refresh?: boolean; includeTrace?: boolean }
  ) {
    const markOpened = options?.markOpened ?? true;
    const refresh = options?.refresh ?? false;
    const includeTrace = options?.includeTrace ?? false;
    const todayKey = getDateKeyUTC(new Date());

    const [
      insights,
      todayFeed,
      activeObligations,
      recentlyPostponedIds,
      personalizationSummary,
      memorySignals,
      preparationPredictions,
      subscriptionActions
    ] =
      await Promise.all([
        this.dashboardInsightsService.getInsights(userId, { includeTrace }),
        this.todayFeedService.getTodayFeed(userId, { includeTrace }),
        this.obligationRepository.findActiveForFeed(userId),
        this.getRecentlyPostponedIds(userId),
        this.personalizationService.getSummary(userId).catch(() => null),
        this.homeMemoryService.getDecisionSignals(userId).catch(() => ({
          currentFocus: null,
          cognitiveLoadScore: 0,
          activeCategories: [],
          behaviorLabels: [],
          recurringVendors: [],
          recurringVendorKeys: [],
          recurringVendorTypeKeys: []
        })),
        this.predictionEngineService
          .getPreparationItems(userId, { days: 7, limit: 3 })
          .catch(() => []),
        this.subscriptionInsightService.listActions(userId, 20).catch(() => [])
      ]);
    const signals = personalizationSummary?.signals ?? getDefaultSignals();
    const predictionBoostByObligation = await this.predictionEngineService
      .getBoostForObligationIds(
        userId,
        activeObligations.map((item) => item.id)
      )
      .catch(() => new Map<string, number>());

    const feedByObligationId = new Map(todayFeed.items.map((item) => [item.obligationId, item]));

    const candidates = activeObligations.map((raw) => {
      const obligation = mapObligation(raw);
      const intelligence = obligation.obligationIntelligence
        ? {
            category: obligation.obligationIntelligence.category,
            priorityBand: obligation.obligationIntelligence.priority.band,
            surfacingTarget: obligation.obligationIntelligence.priority.surfacingTarget,
            priorityScore: obligation.obligationIntelligence.priority.score
          }
        : null;
      const dueDate = obligation.dueDate;
      const basePriorityScore = computePriorityScore(obligation, intelligence);
      const isUrgent = computeIsUrgent(obligation, intelligence);
      const isQuickWin = computeIsQuickWin(obligation);
      const isMoney = typeof obligation.amount === "number" && obligation.amount > 0;
      const isPostponed =
        obligation.status === ObligationStatus.POSTPONED || recentlyPostponedIds.has(obligation.id);
      const hookType = resolveHookType(
        { isUrgent, isQuickWin, isMoney, isPostponed, obligationIntelligence: intelligence },
        feedByObligationId.get(obligation.id)?.hookType
      );
      const autoFlow = feedByObligationId.get(obligation.id)?.autoFlow ?? null;
      const autoFlowBoost =
        autoFlow?.state === "READY" ? 20 : autoFlow?.state === "SUGGESTED" ? 12 : 0;
      const predictionBoost = predictionBoostByObligation.get(obligation.id) ?? 0;
      const predictionReason =
        predictionBoost >= 10
          ? "Predicted to need attention soon"
          : predictionBoost >= 5
            ? "Pattern suggests upcoming attention"
            : null;

      const personalization = this.personalizationService.getDailyPulseScoreAdjustment(signals, {
        obligationType: obligation.type,
        isUrgent,
        isQuickWin,
        isMoney,
        importanceScore: obligation.importanceScore,
        urgencyScore: obligation.urgencyScore
      });
      const memory = getPulseMemoryAdjustment({
        obligation,
        memorySignals
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
        confidenceScore: obligation.confidenceScore,
        confidenceBand: obligation.confidenceBand,
        sourceType: obligation.sourceType,
        needsReview: obligation.needsReview,
        priorityScore:
          basePriorityScore +
          personalization.delta +
          autoFlowBoost +
          memory.delta +
          predictionBoost,
        isUrgent,
        isQuickWin,
        isMoney,
        isPostponed,
        hookType,
        autoFlow,
        predictionBoost,
        predictionReason,
        obligationIntelligence: intelligence
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
    const items = await this.buildActiveItems(
      itemStates,
      selectedCandidates,
      feedByObligationId,
      includeTrace
    );
    const momentum = await this.getMomentum(userId, progress.completedCount);
    const subscriptionSignalSummary = summarizeSubscriptionSignals(subscriptionActions);

    void prisma.auditEvent
      .create({
        data: {
          userId,
          eventType: "obligation_upcoming_generated",
          metadata: {
            selectedCount: selectedCandidates.length,
            urgentCount: selectedCandidates.filter((item) => item.obligationIntelligence?.priorityBand === "URGENT").length,
            highCount: selectedCandidates.filter((item) => item.obligationIntelligence?.priorityBand === "HIGH").length
          }
        }
      })
      .catch(() => null);

    void this.recordPulseImpressionSignals(userId, items).catch(() => null);

    return {
      generatedAt: state.createdAt.toISOString(),
      topInsight: {
        title: insights.topInsight.title,
        description: insights.topInsight.description,
        tone: insights.topInsight.tone,
        why: insights.topInsight.why,
        decisionTrace: includeTrace ? insights.topInsight.decisionTrace : undefined
      },
      upcomingPredictions: preparationPredictions.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        predictedDate: item.predictedDate,
        confidenceBand: item.confidenceBand,
        rationaleSummary: item.rationaleSummary
      })) satisfies PulsePredictionPreview[],
      subscriptionSignals: subscriptionSignalSummary,
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

    const activeCount = existingItems.filter(
      (item) =>
        item.status === DailyPulseItemStatus.PENDING ||
        item.status === DailyPulseItemStatus.OPENED_GUIDED
    ).length;
    const shouldSeed = existingItems.length === 0 || refresh || activeCount < MAX_ITEMS;
    if (shouldSeed) {
      const existingIds = new Set(existingItems.map((item) => item.obligationId));
      const candidatesToAdd = selectedCandidates
        .filter((candidate) => !existingIds.has(candidate.obligationId))
        .slice(0, Math.max(0, MAX_ITEMS - activeCount));

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
      {
        whyItMatters: string;
        why: TrustWhy;
        hookType: "urgent" | "money" | "quick_win" | "none";
        autoFlow?: {
          id: string;
          triggerType: string;
          state: string;
          priorityScore: number;
          ctaLabel: string;
        } | null;
        decisionTrace?: DecisionTrace;
      }
    >,
    includeTrace: boolean
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
          sourceType: candidate?.sourceType ?? "MANUAL",
          confidenceBand: candidate?.confidenceBand ?? "LOW",
          needsReview: candidate?.needsReview ?? true,
          why:
            feed?.why ??
            buildPulseWhy({
              hookType,
              whyItMatters:
                feed?.whyItMatters ??
                buildFallbackWhy(
                  {
                    dueDate: candidate?.dueDate ?? obligation?.dueDate?.toISOString() ?? null,
                    amount:
                      candidate?.amount ??
                      (typeof obligation?.amount === "number" ? obligation.amount : null)
                  },
                  hookType
                ),
              confidenceBand: candidate?.confidenceBand ?? "LOW",
              needsReview: candidate?.needsReview ?? true,
              predictionReason: candidate?.predictionReason ?? null
            }),
          whyItMatters:
            feed?.whyItMatters ??
            buildFallbackWhy(
              {
                dueDate: candidate?.dueDate ?? obligation?.dueDate?.toISOString() ?? null,
                amount: candidate?.amount ?? (typeof obligation?.amount === "number" ? obligation.amount : null)
              },
              hookType
            ),
          actionLabel: candidate?.autoFlow?.ctaLabel ?? "Start",
          hookType,
          priorityScore: candidate?.priorityScore ?? 0,
          autoFlow: candidate?.autoFlow ?? feed?.autoFlow ?? null,
          status:
            state.status === DailyPulseItemStatus.OPENED_GUIDED
              ? "OPENED_GUIDED"
              : "PENDING",
          decisionTrace:
            includeTrace && feed?.decisionTrace
              ? feed.decisionTrace
              : includeTrace
                ? buildPulseDecisionTrace({
                    hookType,
                    candidate
                  })
                : undefined
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
    addFrom(
      sortedByPriority.filter((item) => item.autoFlow?.state === "READY"),
      2
    );
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

      if (options.sourceType !== "today_view_action") {
        await this.recordStatusSignal({
          userId,
          obligationId,
          targetStatus,
          sourceType: options.sourceType
        });
      }
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

  private async recordPulseImpressionSignals(userId: string, items: PulseItem[]) {
    if (items.length === 0) return;

    await this.personalizationSignalService
      .recordSignals(
        items.map((item) => ({
          userId,
          signalType: "ITEM_IMPRESSED" as const,
          obligationId: item.obligationId,
          itemId: item.obligationId,
          category: "OBLIGATION",
          source: "DAILY_PULSE" as const,
          metadata: {
            hookType: item.hookType,
            confidenceBand: item.confidenceBand
          }
        }))
      )
      .catch(() => null);
  }

  private async recordStatusSignal(input: {
    userId: string;
    obligationId: string;
    targetStatus: DailyPulseItemStatus;
    sourceType: string;
  }) {
    const signals: Parameters<PersonalizationSignalService["recordSignals"]>[0] = [];

    if (input.targetStatus === DailyPulseItemStatus.COMPLETED) {
      signals.push({
        userId: input.userId,
        signalType: "ITEM_ACTED",
        obligationId: input.obligationId,
        itemId: input.obligationId,
        category: "OBLIGATION",
        source: "DAILY_PULSE",
        metadata: {
          actionType: "COMPLETE",
          pulseSourceType: input.sourceType
        }
      });
    }

    if (input.targetStatus === DailyPulseItemStatus.POSTPONED) {
      signals.push({
        userId: input.userId,
        signalType: "ITEM_DEFERRED",
        obligationId: input.obligationId,
        itemId: input.obligationId,
        category: "OBLIGATION",
        source: "DAILY_PULSE",
        metadata: {
          actionType: "REMIND_LATER",
          pulseSourceType: input.sourceType
        }
      });
    }

    if (input.targetStatus === DailyPulseItemStatus.OPENED_GUIDED) {
      signals.push(
        {
          userId: input.userId,
          signalType: "DETAIL_OPENED",
          obligationId: input.obligationId,
          itemId: input.obligationId,
          category: "OBLIGATION",
          source: "DAILY_PULSE",
          metadata: {
            pulseSourceType: input.sourceType
          }
        },
        {
          userId: input.userId,
          signalType: "REVIEW_STARTED",
          obligationId: input.obligationId,
          itemId: input.obligationId,
          category: "OBLIGATION",
          source: "DAILY_PULSE",
          metadata: {
            pulseSourceType: input.sourceType
          }
        }
      );
    }

    if (signals.length === 0) return;

    await this.personalizationSignalService.recordSignals(signals).catch(() => null);
    void this.behaviorProfileService.recomputeBehaviorProfile(input.userId).catch(() => null);
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

function summarizeSubscriptionSignals(
  actions: Awaited<ReturnType<SubscriptionInsightService["listActions"]>>
) {
  const items = actions
    .flatMap<PulseSubscriptionSignalItem>((item) =>
      item.insights.map((insight) => ({
        subscriptionId: item.subscriptionId,
        title: item.subscriptionTitle,
        insightType: insight.insightType,
        insightTitle: insight.title,
        severity: insight.severity,
        recommendationType: item.recommendation.recommendationType,
        healthScore: item.health.score,
        nextRenewalDate: item.nextRenewalDate
      }))
    )
    .sort((a, b) => pulseSubscriptionSignalScore(b) - pulseSubscriptionSignalScore(a));

  const renewingSoonCount = items.filter((item) => item.insightType === "RENEWAL_UPCOMING").length;
  const priceIncreasedCount = items.filter((item) => item.insightType === "PRICE_INCREASE").length;
  const needsReviewCount = items.filter((item) => item.recommendationType === "REVIEW").length;

  return {
    summaryLine: buildSubscriptionSummaryLine({
      renewingSoonCount,
      priceIncreasedCount,
      needsReviewCount
    }),
    renewingSoonCount,
    priceIncreasedCount,
    needsReviewCount,
    items: items.slice(0, 3)
  };
}

function pulseSubscriptionSignalScore(item: PulseSubscriptionSignalItem) {
  let score = item.healthScore;
  if (item.severity === "HIGH") score += 24;
  if (item.severity === "MEDIUM") score += 12;
  if (item.insightType === "RENEWAL_UPCOMING") score += 16;
  if (item.insightType === "PRICE_INCREASE") score += 18;
  if (item.insightType === "UNUSED_RISK") score += 14;
  if (item.recommendationType === "REVIEW") score += 8;
  return score;
}

function buildSubscriptionSummaryLine(input: {
  renewingSoonCount: number;
  priceIncreasedCount: number;
  needsReviewCount: number;
}) {
  const parts: string[] = [];
  if (input.renewingSoonCount > 0) {
    parts.push(`${input.renewingSoonCount} subscription${input.renewingSoonCount === 1 ? "" : "s"} renewing soon`);
  }
  if (input.priceIncreasedCount > 0) {
    parts.push(`${input.priceIncreasedCount} price increase${input.priceIncreasedCount === 1 ? "" : "s"}`);
  }
  if (input.needsReviewCount > 0) {
    parts.push(`${input.needsReviewCount} need review`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildPulseWhy(input: {
  hookType: PulseHookType;
  whyItMatters: string;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  needsReview: boolean;
  predictionReason: string | null;
}): TrustWhy {
  const signals = new Set<string>();
  if (input.hookType === "urgent") signals.add("due soon");
  if (input.hookType === "quick_win") signals.add("quick win");
  if (input.hookType === "money") signals.add("money exposure");
  if (input.hookType === "postponed") signals.add("recent activity");
  if (input.hookType === "important") signals.add("high importance");
  if (input.predictionReason) signals.add("recent activity");

  const confidenceFromBand =
    input.confidenceBand === "HIGH" ? 0.88 : input.confidenceBand === "MEDIUM" ? 0.64 : 0.38;

  return {
    primaryReason:
      input.hookType === "urgent"
        ? "Due soon"
        : input.hookType === "quick_win"
          ? "Low effort, high impact"
          : input.hookType === "money"
            ? "Money exposure"
            : input.predictionReason
              ? "Likely coming soon"
            : input.whyItMatters,
    signals: Array.from(signals),
    confidence: toWhyConfidence(input.needsReview ? confidenceFromBand - 0.08 : confidenceFromBand),
    personalizationReason: input.predictionReason
  };
}

function buildPulseDecisionTrace(input: {
  hookType: PulseHookType;
  candidate?: PulseCandidate;
}): DecisionTrace {
  const sourceSignals = [
    `hook:${input.hookType}`,
    `source:${input.candidate?.sourceType?.toLowerCase() ?? "manual"}`
  ];

  const rankingFactors = [
    `priority:${Math.round(input.candidate?.priorityScore ?? 0)}`,
    `urgency:${Math.round(input.candidate?.urgencyScore ?? 0)}`,
    `importance:${Math.round(input.candidate?.importanceScore ?? 0)}`
  ];

  const suppressionFactors = [];
  if (input.candidate?.status === "POSTPONED") {
    suppressionFactors.push("postponed_context");
  }
  if (input.candidate?.effortLevel === "HIGH") {
    suppressionFactors.push("high_effort_penalty");
  }

  const confidenceDrivers = [
    `confidence_band:${input.candidate?.confidenceBand?.toLowerCase() ?? "low"}`,
    input.candidate?.needsReview ? "needs_review" : "ready"
  ];
  if ((input.candidate?.predictionBoost ?? 0) > 0) {
    confidenceDrivers.push(`prediction_boost:${Math.round(input.candidate?.predictionBoost ?? 0)}`);
  }

  return {
    sourceSignals,
    rankingFactors,
    suppressionFactors,
    confidenceDrivers
  };
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
}, intelligence?: {
  priorityScore: number;
  priorityBand: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  surfacingTarget: "PULSE" | "CONTROL_TOWER_READY" | "CONTROL_TOWER_REVIEW" | "UPCOMING" | "SUPPRESS";
} | null) {
  const effortBonus = item.effortLevel === "LOW" ? 8 : item.effortLevel === "MEDIUM" ? 3 : 0;
  const impactBonus = item.impactLevel === "HIGH" ? 8 : item.impactLevel === "MEDIUM" ? 4 : 0;
  const moneyBonus = item.amount && item.amount > 0 ? 6 : 0;
  const postponedBonus = item.status === "POSTPONED" ? 5 : 0;
  const dueSoonBonus = isDueWithinHours(item.dueDate, 48) ? 12 : 0;
  const intelligenceBoost =
    intelligence?.priorityBand === "URGENT"
      ? 18
      : intelligence?.priorityBand === "HIGH"
        ? 10
        : intelligence?.priorityBand === "MEDIUM"
          ? 4
          : 0;

  const raw = item.urgencyScore * 0.45 + item.importanceScore * 0.35;
  const blended =
    intelligence?.priorityScore && intelligence.priorityScore > 0
      ? raw * 0.65 + intelligence.priorityScore * 0.35
      : raw;
  return Math.round(
    blended + effortBonus + impactBonus + moneyBonus + postponedBonus + dueSoonBonus + intelligenceBoost
  );
}

function getPulseMemoryAdjustment(input: {
  obligation: ReturnType<typeof mapObligation>;
  memorySignals: Awaited<ReturnType<HomeMemoryService["getDecisionSignals"]>>;
}) {
  let delta = 0;

  const vendorKey = input.obligation.vendor ? normalizeKey(input.obligation.vendor) : null;
  if (vendorKey && input.memorySignals.recurringVendorKeys.includes(vendorKey)) {
    delta += 5;
  }

  if (input.memorySignals.currentFocus === input.obligation.type) {
    delta += 4;
  }

  if (
    input.memorySignals.behaviorLabels.includes("postpone-heavy") &&
    input.obligation.urgencyScore >= 82
  ) {
    delta += 3;
  }

  return {
    delta
  };
}

function computeIsUrgent(item: {
  dueDate: string | null;
  urgencyScore: number;
}, intelligence?: {
  priorityBand: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
} | null) {
  return isDueWithinHours(item.dueDate, 48) || item.urgencyScore >= 85 || intelligence?.priorityBand === "URGENT";
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
    obligationIntelligence?: {
      category: string;
      priorityBand: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
      surfacingTarget: "PULSE" | "CONTROL_TOWER_READY" | "CONTROL_TOWER_REVIEW" | "UPCOMING" | "SUPPRESS";
    } | null;
  },
  feedHook?: "urgent" | "money" | "quick_win" | "none"
): PulseHookType {
  if (feedHook === "urgent" || item.isUrgent) return "urgent";
  if (item.obligationIntelligence?.priorityBand === "URGENT") return "urgent";
  if (
    item.obligationIntelligence?.category === "PAYMENT_DUE" ||
    item.obligationIntelligence?.category === "CREDIT_CARD"
  ) {
    return "money";
  }
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

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
