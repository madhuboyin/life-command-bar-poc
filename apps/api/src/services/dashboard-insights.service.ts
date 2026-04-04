import {
  FeedbackType,
  ObligationStatus,
  ObligationType,
  Prisma,
  ReminderStatus
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { ObligationView } from "../types/obligation.types";
import { PersonalizationService } from "./personalization.service";
import type { PersonalizationSignals } from "../types/personalization.types";
import type { DecisionTrace, TrustWhy } from "../utils/trust-layer";
import { toWhyConfidence } from "../utils/trust-layer";
import { AutoFlowService } from "./auto-flow.service";

const LOOKBACK_DAYS = 7;
const QUICK_WIN_CONFIDENCE_THRESHOLD = 0.85;
const QUICK_WIN_IMPORTANCE_THRESHOLD = 50;
const URGENCY_THRESHOLD = 85;
const DUE_SOON_HOURS = 48;

type InsightTone = "neutral" | "positive" | "warning";
type ReliefBand = "LOW" | "MODERATE" | "STRONG";
type CardKey =
  | "attention"
  | "relief"
  | "quick_wins"
  | "money_exposure"
  | "postponed"
  | "open_category";

type SummaryType = {
  handledThisWeek: number;
  activeNow: number;
  quickWinsAvailable: number;
  overdueOrUrgent: number;
  postponedRecently: number;
  reliefScore: {
    value: number;
    band: ReliefBand;
  };
  estimatedMentalRelief: {
    value: number;
    label: string;
  };
  estimatedMoneyExposure: {
    amount: number | null;
    currency: string | null;
  };
  mostCommonOpenType: ObligationType | null;
};

type DashboardCard = {
  key: CardKey;
  title: string;
  value: string;
  supportingText: string;
  tone: InsightTone;
  priority: number;
  targetView: ObligationView | null;
  why: TrustWhy;
  decisionTrace?: DecisionTrace;
};

type TopInsight = {
  title: string;
  description: string;
  tone: InsightTone;
  targetView: ObligationView | null;
  why: TrustWhy;
  decisionTrace?: DecisionTrace;
};

type DashboardCardBase = Omit<DashboardCard, "why" | "decisionTrace">;
type TopInsightBase = Omit<TopInsight, "why" | "decisionTrace">;

type DashboardInsightsResponse = {
  summary: SummaryType;
  cards: DashboardCard[];
  topInsight: TopInsight;
};

const activeStatuses: ObligationStatus[] = [
  ObligationStatus.ACTIVE,
  ObligationStatus.POSTPONED
];

const obligationForMetricsSelect = {
  id: true,
  type: true,
  title: true,
  status: true,
  dueDate: true,
  amount: true,
  currency: true,
  confidenceScore: true,
  urgencyScore: true,
  importanceScore: true,
  impactLevel: true,
  effortLevel: true
} satisfies Prisma.ObligationSelect;

type ObligationForMetrics = Prisma.ObligationGetPayload<{
  select: typeof obligationForMetricsSelect;
}>;

type HandledObligation = Prisma.ObligationGetPayload<{
  select: {
    id: true;
    impactLevel: true;
    effortLevel: true;
  };
}>;

type ReliefScoreInput = {
  handledThisWeek: number;
  quickWinsAvailable: number;
  ignoredThisWeek: number;
  repeatedPostponementCount: number;
  overdueOrUrgent: number;
  resolutionRunsThisWeek: number;
  remindersDueSoon: number;
};

type PostponedStats = {
  uniqueCount: number;
  repeatedCount: number;
};

type MoneyExposure = {
  amount: number | null;
  currency: string | null;
};

type TopInsightInput = {
  handledThisWeek: number;
  activeNow: number;
  quickWinsAvailable: number;
  overdueOrUrgent: number;
  postponedRecently: number;
  repeatedPostponementCount: number;
  moneyExposure: MoneyExposure;
  signals: PersonalizationSignals;
};

export class DashboardInsightsService {
  private readonly personalizationService = new PersonalizationService();
  private readonly autoFlowService = new AutoFlowService();

  async getInsights(
    userId: string,
    options?: { includeTrace?: boolean }
  ): Promise<DashboardInsightsResponse> {
    const includeTrace = options?.includeTrace ?? false;
    const now = new Date();
    const windowStart = getTrailingWindowStart(now, LOOKBACK_DAYS);
    const dueSoonThreshold = addHours(now, DUE_SOON_HOURS);

    const [
      activeObligations,
      resolvedObligationsThisWeek,
      recentFeedbackEvents,
      recentAuditEvents,
      resolutionRunsThisWeek,
      remindersDueSoon,
      personalizationSummary,
      autoFlowSummary
    ] = await Promise.all([
      prisma.obligation.findMany({
        where: {
          userId,
          status: {
            in: activeStatuses
          }
        },
        select: obligationForMetricsSelect
      }),
      prisma.obligation.findMany({
        where: {
          userId,
          status: ObligationStatus.RESOLVED,
          lastActedAt: {
            gte: windowStart
          }
        },
        select: {
          id: true,
          impactLevel: true,
          effortLevel: true
        }
      }),
      prisma.feedbackEvent.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          },
          type: {
            in: [
              FeedbackType.COMPLETED,
              FeedbackType.POSTPONED,
              FeedbackType.IGNORED,
              FeedbackType.DONT_SHOW_AGAIN
            ]
          }
        },
        select: {
          obligationId: true,
          type: true
        }
      }),
      prisma.auditEvent.findMany({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          },
          eventType: {
            in: [
              "obligation_marked_done",
              "obligation_postponed",
              "obligation_dismissed",
              "obligation_updated"
            ]
          }
        },
        select: {
          obligationId: true,
          eventType: true,
          metadata: true
        }
      }),
      prisma.resolutionRun.count({
        where: {
          userId,
          createdAt: {
            gte: windowStart
          }
        }
      }),
      prisma.reminder.count({
        where: {
          userId,
          status: {
            in: [ReminderStatus.SCHEDULED, ReminderStatus.TRIGGERED]
          },
          scheduledFor: {
            gte: now,
            lte: dueSoonThreshold
          }
        }
      }),
      this.personalizationService.getSummary(userId).catch(() => null)
      ,
      this.autoFlowService.list(userId, { limit: 12 }).catch(() => ({
        generatedAt: new Date().toISOString(),
        items: [],
        summary: {
          readyCount: 0,
          suggestedCount: 0
        }
      }))
    ]);
    const signals = personalizationSummary?.signals ?? getDefaultSignals();

    const handledIds = collectHandledObligationIds(
      resolvedObligationsThisWeek,
      recentFeedbackEvents,
      recentAuditEvents
    );
    const handledThisWeek = handledIds.size;

    const handledObligations = await this.loadHandledObligations(userId, handledIds);

    const activeNow = activeObligations.length;
    const quickWinsAvailable = activeObligations.filter(isQuickWin).length;
    const overdueOrUrgent = activeObligations.filter((item) =>
      isOverdueOrUrgent(item, now, dueSoonThreshold)
    ).length;

    const postponedStats = collectPostponedStats(recentFeedbackEvents, recentAuditEvents);
    const ignoredThisWeek = collectIgnoredObligationIds(
      recentFeedbackEvents,
      recentAuditEvents
    ).size;

    const reliefValue = computeReliefScore({
      handledThisWeek,
      quickWinsAvailable,
      ignoredThisWeek,
      repeatedPostponementCount: postponedStats.repeatedCount,
      overdueOrUrgent,
      resolutionRunsThisWeek,
      remindersDueSoon
    });
    const reliefBand = getReliefBand(reliefValue);

    const estimatedMentalReliefValue = estimateMentalRelief(handledObligations);
    const estimatedMentalReliefLabel = getMentalReliefLabel(
      estimatedMentalReliefValue,
      handledThisWeek
    );

    const moneyExposure = estimateMoneyExposure(activeObligations);
    const mostCommonOpenType = findMostCommonOpenType(activeObligations);

    const summary: SummaryType = {
      handledThisWeek,
      activeNow,
      quickWinsAvailable,
      overdueOrUrgent,
      postponedRecently: postponedStats.uniqueCount,
      reliefScore: {
        value: reliefValue,
        band: reliefBand
      },
      estimatedMentalRelief: {
        value: estimatedMentalReliefValue,
        label: estimatedMentalReliefLabel
      },
      estimatedMoneyExposure: moneyExposure,
      mostCommonOpenType
    };

    const topInsightBase = chooseTopInsight({
      handledThisWeek,
      activeNow,
      quickWinsAvailable,
      overdueOrUrgent,
      postponedRecently: postponedStats.uniqueCount,
      repeatedPostponementCount: postponedStats.repeatedCount,
      moneyExposure,
      signals
    });

    const cards = buildCards({
      summary,
      postponedStats,
      remindersDueSoon
    }).map((card) => attachCardWhy(card, summary, includeTrace));

    const baseWithAutoFlow =
      autoFlowSummary.summary.readyCount > 0
        ? buildAutoFlowTopInsight(autoFlowSummary.summary.readyCount)
        : topInsightBase;

    const topInsight = attachTopInsightWhy(
      baseWithAutoFlow,
      summary,
      signals,
      includeTrace
    );

    return {
      summary,
      cards,
      topInsight
    };
  }

  private async loadHandledObligations(userId: string, handledIds: Set<string>) {
    if (handledIds.size === 0) {
      return [];
    }

    return prisma.obligation.findMany({
      where: {
        userId,
        id: {
          in: Array.from(handledIds)
        }
      },
      select: {
        id: true,
        impactLevel: true,
        effortLevel: true
      }
    });
  }
}

function getTrailingWindowStart(now: Date, trailingDays: number) {
  const start = new Date(now);
  start.setDate(start.getDate() - trailingDays);
  return start;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function collectHandledObligationIds(
  resolvedObligationsThisWeek: Array<{ id: string }>,
  feedbackEvents: Array<{ obligationId: string | null; type: FeedbackType }>,
  auditEvents: Array<{
    obligationId: string | null;
    eventType: string;
    metadata: Prisma.JsonValue;
  }>
) {
  const ids = new Set<string>();

  for (const item of resolvedObligationsThisWeek) {
    ids.add(item.id);
  }

  for (const item of feedbackEvents) {
    if (item.type !== FeedbackType.COMPLETED || !item.obligationId) continue;
    ids.add(item.obligationId);
  }

  for (const item of auditEvents) {
    if (!item.obligationId) continue;

    if (item.eventType === "obligation_marked_done") {
      ids.add(item.obligationId);
      continue;
    }

    if (item.eventType === "obligation_updated" && includesResolvedStatus(item.metadata)) {
      ids.add(item.obligationId);
    }
  }

  return ids;
}

function collectIgnoredObligationIds(
  feedbackEvents: Array<{ obligationId: string | null; type: FeedbackType }>,
  auditEvents: Array<{ obligationId: string | null; eventType: string }>
) {
  const ids = new Set<string>();

  for (const item of feedbackEvents) {
    if (!item.obligationId) continue;
    if (item.type === FeedbackType.IGNORED || item.type === FeedbackType.DONT_SHOW_AGAIN) {
      ids.add(item.obligationId);
    }
  }

  for (const item of auditEvents) {
    if (item.eventType === "obligation_dismissed" && item.obligationId) {
      ids.add(item.obligationId);
    }
  }

  return ids;
}

function collectPostponedStats(
  feedbackEvents: Array<{ obligationId: string | null; type: FeedbackType }>,
  auditEvents: Array<{ obligationId: string | null; eventType: string }>
): PostponedStats {
  const counts = new Map<string, number>();

  for (const item of feedbackEvents) {
    if (item.type !== FeedbackType.POSTPONED || !item.obligationId) continue;
    counts.set(item.obligationId, (counts.get(item.obligationId) ?? 0) + 1);
  }

  for (const item of auditEvents) {
    if (item.eventType !== "obligation_postponed" || !item.obligationId) continue;
    counts.set(item.obligationId, (counts.get(item.obligationId) ?? 0) + 1);
  }

  let repeatedCount = 0;
  for (const count of counts.values()) {
    if (count >= 2) repeatedCount += 1;
  }

  return {
    uniqueCount: counts.size,
    repeatedCount
  };
}

function includesResolvedStatus(metadata: Prisma.JsonValue): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  const status = (metadata as Record<string, unknown>).status;
  return status === ObligationStatus.RESOLVED;
}

function isQuickWin(obligation: ObligationForMetrics) {
  return (
    obligation.status !== ObligationStatus.RESOLVED &&
    obligation.status !== ObligationStatus.IGNORED &&
    obligation.effortLevel === "LOW" &&
    Number(obligation.confidenceScore) >= QUICK_WIN_CONFIDENCE_THRESHOLD &&
    Number(obligation.importanceScore) >= QUICK_WIN_IMPORTANCE_THRESHOLD &&
    (obligation.impactLevel === "MEDIUM" || obligation.impactLevel === "HIGH")
  );
}

function isOverdueOrUrgent(
  obligation: ObligationForMetrics,
  now: Date,
  dueSoonThreshold: Date
) {
  const dueDate = obligation.dueDate;
  const dueSoonOrOverdue =
    dueDate !== null && dueDate !== undefined && dueDate <= dueSoonThreshold;

  if (dueSoonOrOverdue && dueDate <= now) {
    return true;
  }

  if (dueSoonOrOverdue) {
    return true;
  }

  return Number(obligation.urgencyScore) >= URGENCY_THRESHOLD;
}

function estimateMoneyExposure(activeObligations: ObligationForMetrics[]): MoneyExposure {
  const withAmounts = activeObligations.filter(
    (item) => item.amount !== null && Number(item.amount) > 0
  );

  if (withAmounts.length === 0) {
    return {
      amount: null,
      currency: null
    };
  }

  const amount = roundTo2(withAmounts.reduce((sum, item) => sum + Number(item.amount), 0));
  const currencySet = new Set<string>();

  for (const item of withAmounts) {
    if (item.currency) {
      currencySet.add(item.currency.toUpperCase());
    }
  }

  const currency = currencySet.size === 1 ? Array.from(currencySet)[0] : null;

  return {
    amount,
    currency
  };
}

function findMostCommonOpenType(activeObligations: ObligationForMetrics[]) {
  if (activeObligations.length === 0) return null;

  const counts = new Map<ObligationType, number>();
  for (const item of activeObligations) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }

  const tieBreakerOrder: ObligationType[] = [
    ObligationType.BILL,
    ObligationType.SUBSCRIPTION,
    ObligationType.RENEWAL,
    ObligationType.COMMITMENT
  ];

  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return tieBreakerOrder.indexOf(a[0]) - tieBreakerOrder.indexOf(b[0]);
  });

  return sorted[0]?.[0] ?? null;
}

export function computeReliefScore(input: ReliefScoreInput) {
  const resolutionBonus = Math.min(input.resolutionRunsThisWeek, 4) * 2;
  const reminderPressurePenalty = Math.min(input.remindersDueSoon, 5) * 2;

  // Deterministic relief formula (0-100):
  // Start from a neutral base and adjust by recent behavior.
  // - Reward handled work and visible momentum.
  // - Penalize ignored actions, repeated postponement, and urgent backlog.
  // The weights are intentionally simple and easy to tune.
  const rawScore =
    50 +
    input.handledThisWeek * 8 +
    input.quickWinsAvailable * 3 +
    resolutionBonus -
    input.ignoredThisWeek * 6 -
    input.repeatedPostponementCount * 8 -
    input.overdueOrUrgent * 5 -
    reminderPressurePenalty;

  return clamp(Math.round(rawScore), 0, 100);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getReliefBand(score: number): ReliefBand {
  if (score >= 70) return "STRONG";
  if (score >= 40) return "MODERATE";
  return "LOW";
}

function estimateMentalRelief(handledObligations: HandledObligation[]) {
  let total = 0;

  for (const obligation of handledObligations) {
    const impactWeight =
      obligation.impactLevel === "HIGH" ? 3 : obligation.impactLevel === "MEDIUM" ? 2 : 1;

    const effortWeight =
      obligation.effortLevel === "LOW"
        ? 1.2
        : obligation.effortLevel === "MEDIUM"
          ? 1
          : 0.8;

    total += impactWeight * effortWeight;
  }

  return Math.max(0, Math.round(total));
}

function getMentalReliefLabel(value: number, handledThisWeek: number) {
  if (handledThisWeek === 0) return "Start with one quick win";
  if (value >= 8) return "Good momentum";
  if (value >= 4) return "Steady progress";
  return "Small but meaningful progress";
}

function chooseTopInsight(input: TopInsightInput): TopInsightBase {
  if (input.overdueOrUrgent > 0) {
    return {
      title: `${input.overdueOrUrgent} urgent ${pluralize("item", input.overdueOrUrgent)} need attention`,
      description:
        input.overdueOrUrgent === 1
          ? "Handling this now will reduce immediate pressure."
          : "Clearing these first should ease near-term stress.",
      tone: "warning",
      targetView: "urgent"
    };
  }

  if (
    input.signals.moneySensitivity === "low" &&
    input.moneyExposure.amount !== null &&
    input.moneyExposure.amount > 0
  ) {
    return {
      title: `${formatMoneyValue(input.moneyExposure)} needs a quick money check`,
      description: "Money-related items have been easy to defer recently, so this is worth reviewing now.",
      tone: "warning",
      targetView: "money"
    };
  }

  if (input.signals.quickWinAffinity === "high" && input.quickWinsAvailable > 0) {
    return {
      title: `${input.quickWinsAvailable} quick ${pluralize("win", input.quickWinsAvailable)} can build momentum`,
      description: "You usually clear quick wins well, so starting there should feel lighter.",
      tone: "positive",
      targetView: "quick_wins"
    };
  }

  if (input.repeatedPostponementCount > 0 || input.postponedRecently >= 3) {
    return {
      title: `You postponed ${input.postponedRecently} ${pluralize("item", input.postponedRecently)} recently`,
      description:
        input.repeatedPostponementCount > 0
          ? "At least one item has been postponed more than once."
          : "Picking one item to finish can break the postpone loop.",
      tone: "warning",
      targetView: "postponed_recently"
    };
  }

  if (input.quickWinsAvailable >= 2) {
    return {
      title: `${input.quickWinsAvailable} quick wins are available right now`,
      description: "Low-effort, meaningful tasks are ready to be cleared.",
      tone: "positive",
      targetView: "quick_wins"
    };
  }

  if (input.handledThisWeek >= 3) {
    return {
      title: `You cleared ${input.handledThisWeek} ${pluralize("item", input.handledThisWeek)} this week`,
      description: "Your recent progress is building healthy momentum.",
      tone: "positive",
      targetView: "resolved_recently"
    };
  }

  if (input.moneyExposure.amount !== null && input.moneyExposure.amount > 0) {
    return {
      title: `${formatMoneyValue(input.moneyExposure)} may need attention soon`,
      description: "This reflects open obligations with amounts currently in your queue.",
      tone: "neutral",
      targetView: "money"
    };
  }

  if (input.activeNow === 0) {
    return {
      title: "Your queue is clear right now",
      description: "No active or postponed obligations are currently pending.",
      tone: "positive",
      targetView: null
    };
  }

  return {
    title: `You have ${input.activeNow} open ${pluralize("item", input.activeNow)}`,
    description: "Start with one quick win to reduce mental load.",
    tone: "neutral",
    targetView: "active_now"
  };
}

function buildAutoFlowTopInsight(readyCount: number): TopInsightBase {
  return {
    title: `${readyCount} item${readyCount === 1 ? "" : "s"} are ready now`,
    description:
      readyCount === 1
        ? "The system prepared one ready-to-act flow you can confirm immediately."
        : "The system prepared ready-to-act flows. Confirm one to move quickly.",
    tone: "positive",
    targetView: "active_now"
  };
}

function buildCards(input: {
  summary: SummaryType;
  postponedStats: PostponedStats;
  remindersDueSoon: number;
}): DashboardCardBase[] {
  const { summary, postponedStats, remindersDueSoon } = input;

  const cards: DashboardCardBase[] = [
    {
      key: "attention",
      title: "Needs attention",
      value:
        summary.overdueOrUrgent === 0
          ? "No urgent items"
          : `${summary.overdueOrUrgent} urgent or overdue`,
      supportingText:
        remindersDueSoon > 0
          ? `${remindersDueSoon} ${pluralize("reminder", remindersDueSoon)} due soon.`
          : "Nothing urgent in the next two days.",
      tone: summary.overdueOrUrgent > 0 ? "warning" : "positive",
      priority: summary.overdueOrUrgent > 0 ? 1 : 5,
      targetView: "urgent"
    },
    {
      key: "relief",
      title: "Relief score",
      value: `${summary.reliefScore.value} (${summary.reliefScore.band})`,
      supportingText: `Mental relief: ${summary.estimatedMentalRelief.label}.`,
      tone:
        summary.reliefScore.band === "STRONG"
          ? "positive"
          : summary.reliefScore.band === "LOW"
            ? "warning"
            : "neutral",
      priority: summary.reliefScore.band === "LOW" ? 2 : 4,
      targetView: "resolved_recently"
    },
    {
      key: "quick_wins",
      title: "Quick wins",
      value: `${summary.quickWinsAvailable} available`,
      supportingText:
        summary.quickWinsAvailable > 0
          ? "Low-effort tasks with meaningful impact are ready."
          : "No strong quick wins detected right now.",
      tone: summary.quickWinsAvailable > 0 ? "positive" : "neutral",
      priority: summary.quickWinsAvailable > 0 ? 3 : 6,
      targetView: "quick_wins"
    },
    {
      key: "money_exposure",
      title: "Money exposure",
      value:
        summary.estimatedMoneyExposure.amount === null
          ? "No amount data"
          : formatMoneyValue(summary.estimatedMoneyExposure),
      supportingText:
        summary.estimatedMoneyExposure.amount === null
          ? "No active obligations with amounts are currently open."
          : summary.estimatedMoneyExposure.currency === null
            ? "Includes multiple currencies."
            : "Open obligations with known amounts.",
      tone: summary.estimatedMoneyExposure.amount === null ? "neutral" : "warning",
      priority: summary.estimatedMoneyExposure.amount === null ? 7 : 4,
      targetView: "money"
    },
    {
      key: "postponed",
      title: "Postponed recently",
      value: `${summary.postponedRecently} ${pluralize("item", summary.postponedRecently)}`,
      supportingText:
        postponedStats.repeatedCount > 0
          ? `${postponedStats.repeatedCount} ${pluralize("item", postponedStats.repeatedCount)} postponed more than once.`
          : "No repeated postponement pattern detected.",
      tone: summary.postponedRecently > 0 ? "warning" : "neutral",
      priority: postponedStats.repeatedCount > 0 ? 2 : summary.postponedRecently > 0 ? 3 : 7,
      targetView: "postponed_recently"
    },
    {
      key: "open_category",
      title: "Largest open category",
      value: summary.mostCommonOpenType ?? "No open items",
      supportingText:
        summary.mostCommonOpenType !== null
          ? `${toCategoryLabel(summary.mostCommonOpenType)} are most common right now.`
          : "You have no active or postponed obligations.",
      tone: summary.mostCommonOpenType ? "neutral" : "positive",
      priority: 8,
      targetView: toOpenTypeTargetView(summary.mostCommonOpenType)
    }
  ];

  return cards.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

function attachCardWhy(
  card: DashboardCardBase,
  summary: SummaryType,
  includeTrace: boolean
): DashboardCard {
  const signals = deriveSignalsFromCardKey(card.key);
  const why: TrustWhy = {
    primaryReason: card.supportingText,
    signals,
    confidence: toWhyConfidence(1 - Math.min(card.priority, 8) / 10),
    personalizationReason: null
  };

  return {
    ...card,
    why,
    decisionTrace: includeTrace
      ? {
          sourceSignals: [`card:${card.key}`],
          rankingFactors: [`priority:${card.priority}`],
          suppressionFactors:
            summary.postponedRecently > 0 ? ["postponement_pressure"] : [],
          confidenceDrivers: [`tone:${card.tone}`]
        }
      : undefined
  };
}

function attachTopInsightWhy(
  insight: TopInsightBase,
  summary: SummaryType,
  signals: PersonalizationSignals,
  includeTrace: boolean
): TopInsight {
  const derivedSignals: string[] = [];
  if (summary.overdueOrUrgent > 0) derivedSignals.push("due soon");
  if (summary.quickWinsAvailable > 0) derivedSignals.push("quick win");
  if ((summary.estimatedMoneyExposure.amount ?? 0) > 0) derivedSignals.push("money exposure");
  if (summary.postponedRecently > 0) derivedSignals.push("recent activity");
  if (derivedSignals.length === 0) derivedSignals.push("high importance");

  const personalizationReason =
    signals.quickWinAffinity === "high" && summary.quickWinsAvailable > 0
      ? "You usually clear quick wins first"
      : signals.moneySensitivity === "low" &&
          (summary.estimatedMoneyExposure.amount ?? 0) > 0
        ? "Money tasks tend to be postponed"
        : null;

  return {
    ...insight,
    why: {
      primaryReason: insight.description,
      signals: derivedSignals,
      confidence: toWhyConfidence(insight.tone === "warning" ? 0.82 : 0.68),
      personalizationReason
    },
    decisionTrace: includeTrace
      ? {
          sourceSignals: [
            `active_now:${summary.activeNow}`,
            `urgent:${summary.overdueOrUrgent}`,
            `quick_wins:${summary.quickWinsAvailable}`
          ],
          rankingFactors: [
            `postponed_recently:${summary.postponedRecently}`,
            `relief_score:${summary.reliefScore.value}`
          ],
          suppressionFactors: summary.activeNow === 0 ? ["empty_queue"] : [],
          confidenceDrivers: [`tone:${insight.tone}`]
        }
      : undefined
  };
}

function deriveSignalsFromCardKey(key: DashboardCardBase["key"]) {
  if (key === "attention") return ["due soon", "high importance"];
  if (key === "relief") return ["recent activity", "high importance"];
  if (key === "quick_wins") return ["quick win"];
  if (key === "money_exposure") return ["money exposure"];
  if (key === "postponed") return ["recent activity"];
  return ["high importance"];
}

function toCategoryLabel(value: ObligationType) {
  switch (value) {
    case ObligationType.BILL:
      return "Bills";
    case ObligationType.SUBSCRIPTION:
      return "Subscriptions";
    case ObligationType.RENEWAL:
      return "Renewals";
    case ObligationType.COMMITMENT:
      return "Commitments";
    default:
      return "Items";
  }
}

function toOpenTypeTargetView(type: ObligationType | null): ObligationView | null {
  switch (type) {
    case ObligationType.BILL:
      return "bills";
    case ObligationType.SUBSCRIPTION:
      return "subscriptions";
    case ObligationType.RENEWAL:
      return "renewals";
    case ObligationType.COMMITMENT:
      return "commitments";
    default:
      return null;
  }
}

function pluralize(word: string, count: number) {
  return count === 1 ? word : `${word}s`;
}

function formatMoneyValue(exposure: MoneyExposure) {
  if (exposure.amount === null) return "No amount data";

  if (exposure.currency) {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: exposure.currency,
        maximumFractionDigits: 2
      }).format(exposure.amount);
    } catch {
      // Fall through to a safe numeric display.
    }
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(exposure.amount)}`;
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
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
