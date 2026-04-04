import { ObligationStatus } from "@prisma/client";
import { DashboardInsightsService } from "./dashboard-insights.service";
import { TodayFeedService } from "./today-feed.service";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { prisma } from "../clients/prisma.client";

type PulseHookType = "urgent" | "quick_win" | "money" | "postponed" | "important";
type PulseTrend = "up" | "down" | "flat";

type PulseItem = {
  obligationId: string;
  title: string;
  whyItMatters: string;
  actionLabel: string;
  hookType: PulseHookType;
  priorityScore: number;
};

type PulseCandidate = {
  obligationId: string;
  title: string;
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
};

const MAX_ITEMS = 5;
const LOOKBACK_DAYS = 7;

export class DailyPulseService {
  private readonly dashboardInsightsService = new DashboardInsightsService();
  private readonly todayFeedService = new TodayFeedService();
  private readonly obligationRepository = new ObligationRepository();

  async getPulse(userId: string, options?: { markOpened?: boolean; refresh?: boolean }) {
    const markOpened = options?.markOpened ?? true;
    const refresh = options?.refresh ?? false;
    const todayKey = getDateKeyUTC(new Date());

    const [insights, todayFeed, activeObligations, recentlyPostponedIds] = await Promise.all([
      this.dashboardInsightsService.getInsights(userId),
      this.todayFeedService.getTodayFeed(userId),
      this.obligationRepository.findActiveForFeed(userId),
      this.getRecentlyPostponedIds(userId)
    ]);

    const feedByObligationId = new Map(
      todayFeed.items.map((item) => [item.obligationId, item])
    );

    const candidates = activeObligations.map((raw) => {
      const obligation = mapObligation(raw);
      const dueDate = obligation.dueDate;
      const priorityScore = computePriorityScore(obligation);
      const isUrgent = computeIsUrgent(obligation);
      const isQuickWin = computeIsQuickWin(obligation);
      const isMoney = typeof obligation.amount === "number" && obligation.amount > 0;
      const isPostponed =
        obligation.status === ObligationStatus.POSTPONED ||
        recentlyPostponedIds.has(obligation.id);

      return {
        obligationId: obligation.id,
        title: obligation.title,
        status: obligation.status,
        urgencyScore: obligation.urgencyScore,
        importanceScore: obligation.importanceScore,
        effortLevel: obligation.effortLevel,
        impactLevel: obligation.impactLevel,
        amount: obligation.amount,
        dueDate,
        priorityScore,
        isUrgent,
        isQuickWin,
        isMoney,
        isPostponed
      } satisfies PulseCandidate;
    });

    const items = this.selectPulseItems(candidates, feedByObligationId);
    const momentum = await this.getMomentum(userId);

    let state = await prisma.dailyPulseState.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayKey
        }
      }
    });

    if (!state) {
      state = await prisma.dailyPulseState.create({
        data: {
          userId,
          date: todayKey,
          openedAt: markOpened ? new Date() : null
        }
      });
    } else if (markOpened && (!state.openedAt || refresh)) {
      state = await prisma.dailyPulseState.update({
        where: { id: state.id },
        data: {
          openedAt: new Date()
        }
      });
    }

    return {
      generatedAt: state.createdAt.toISOString(),
      topInsight: {
        title: insights.topInsight.title,
        description: insights.topInsight.description,
        tone: insights.topInsight.tone
      },
      items,
      momentum,
      quickSummary: buildQuickSummary(items, momentum),
      state: {
        date: state.date,
        openedAt: state.openedAt?.toISOString() ?? null,
        completedCount: state.completedCount,
        dismissedCount: state.dismissedCount
      }
    };
  }

  async getPulseState(userId: string) {
    const todayKey = getDateKeyUTC(new Date());

    const state = await prisma.dailyPulseState.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayKey
        }
      }
    });

    return {
      date: todayKey,
      openedToday: Boolean(state?.openedAt),
      openedAt: state?.openedAt?.toISOString() ?? null,
      completedCount: state?.completedCount ?? 0,
      dismissedCount: state?.dismissedCount ?? 0
    };
  }

  async trackAction(
    userId: string,
    action: "COMPLETED" | "DISMISSED" | "POSTPONED"
  ) {
    const todayKey = getDateKeyUTC(new Date());

    const existing = await prisma.dailyPulseState.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayKey
        }
      }
    });

    const state = existing
      ? await prisma.dailyPulseState.update({
          where: { id: existing.id },
          data: {
            openedAt: existing.openedAt ?? new Date(),
            completedCount:
              action === "COMPLETED" ? { increment: 1 } : undefined,
            dismissedCount:
              action === "DISMISSED" ? { increment: 1 } : undefined
          }
        })
      : await prisma.dailyPulseState.create({
          data: {
            userId,
            date: todayKey,
            openedAt: new Date(),
            completedCount: action === "COMPLETED" ? 1 : 0,
            dismissedCount: action === "DISMISSED" ? 1 : 0
          }
        });

    return {
      date: state.date,
      openedAt: state.openedAt?.toISOString() ?? null,
      completedCount: state.completedCount,
      dismissedCount: state.dismissedCount
    };
  }

  private selectPulseItems(
    candidates: PulseCandidate[],
    feedByObligationId: Map<
      string,
      { whyItMatters: string; hookType: "urgent" | "money" | "quick_win" | "none" }
    >
  ): PulseItem[] {
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

    addFrom(
      sortedByPriority.filter((item) => item.isUrgent),
      2
    );

    addFrom(
      sortedByPriority.filter((item) => item.isQuickWin),
      2
    );

    addFrom(
      sortedByPriority.filter((item) => item.isMoney),
      1
    );

    addFrom(sortedByPriority, MAX_ITEMS);

    return selected.slice(0, MAX_ITEMS).map((item) => {
      const feed = feedByObligationId.get(item.obligationId);
      const hookType = resolveHookType(item, feed?.hookType);

      return {
        obligationId: item.obligationId,
        title: item.title,
        whyItMatters: feed?.whyItMatters ?? buildFallbackWhy(item, hookType),
        actionLabel: "Guide me",
        hookType,
        priorityScore: item.priorityScore
      };
    });
  }

  private async getMomentum(userId: string) {
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
  momentum: { handledThisWeek: number; trend: PulseTrend }
) {
  if (items.length === 0) {
    return "You are all caught up today.";
  }

  const urgentCount = items.filter((item) => item.hookType === "urgent").length;
  const quickWinCount = items.filter((item) => item.hookType === "quick_win").length;

  if (urgentCount > 0) {
    return `${urgentCount} urgent ${pluralize("item", urgentCount)} and ${items.length - urgentCount} other priorities are ready.`;
  }

  if (quickWinCount > 0) {
    return `${quickWinCount} quick ${pluralize("win", quickWinCount)} can build momentum today.`;
  }

  const trendIcon = momentum.trend === "up" ? "↑" : momentum.trend === "down" ? "↓" : "→";
  return `${items.length} focused ${pluralize("decision", items.length)} for today. Momentum ${trendIcon}.`;
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
