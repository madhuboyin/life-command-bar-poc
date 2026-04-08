import { ObligationStatus } from "@prisma/client";
import { createAuditEvent } from "../observability/audit-event";
import { DailyCommandCenterRepository } from "../repositories/daily-command-center.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { ControlTowerService } from "./control-tower.service";
import {
  TodayPrioritizationService,
  type TodayAction,
  type TodayPrioritizedItem,
  type TodayPriorityBand
} from "./today-prioritization.service";
import { DailyPulseService } from "./daily-pulse.service";
import { PersonalizationSignalService } from "./personalization-signal.service";
import { BehaviorProfileService } from "./behavior-profile.service";
import {
  PersonalizationPolicyService,
  type PersonalizedTodayItem
} from "./personalization-policy.service";
import {
  toBehaviorProfileView,
  type PersonalizationDebugMetadata,
  type ReminderSuggestionStyle,
  type TodayPresentationStyle
} from "../types/personalization-policy.types";

export type DailyCommandCenterItem = {
  id: string;
  itemType: "OBLIGATION" | "SUBSCRIPTION_REVIEW";
  title: string;
  subtitle: string | null;
  category: string;
  vendorName: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  renewalDate: string | null;
  priorityScore: number;
  priorityBand: TodayPriorityBand;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  primaryAction: TodayAction;
  secondaryActions: TodayAction[];
  whyNow: string;
  whyThisMatters: string;
  sourceSummary: string;
  scopeType: "PERSONAL" | "HOUSEHOLD";
  presentationStyle: TodayPresentationStyle;
  reminderStyle: ReminderSuggestionStyle;
  personalization: PersonalizationDebugMetadata;
  assignee:
    | {
        id: string;
        email: string;
        name: string | null;
      }
    | null;
};

export type DailyCommandCenterCompletedItem = {
  id: string;
  title: string;
  status: "COMPLETED" | "SAFE" | "DEFERRED";
  summary: string;
  actedAt: string | null;
  scopeType: "PERSONAL" | "HOUSEHOLD";
  assignee:
    | {
        id: string;
        email: string;
        name: string | null;
      }
    | null;
};

export type DailyCommandCenterResponse = {
  generatedAt: string;
  summary: {
    todayCount: number;
    urgentCount: number;
    reviewCount: number;
    upcomingCount: number;
    completedTodayCount: number;
  };
  primaryItems: DailyCommandCenterItem[];
  upcoming: DailyCommandCenterItem[];
  completedOrSafe: DailyCommandCenterCompletedItem[];
  pulse: {
    openedToday: boolean;
    totalItems: number;
    remainingCount: number;
    completedCount: number;
  };
};

export class DailyCommandCenterService {
  private readonly repository = new DailyCommandCenterRepository();
  private readonly prioritizationService = new TodayPrioritizationService();
  private readonly pulseService = new DailyPulseService();
  private readonly controlTowerService = new ControlTowerService();
  private readonly personalizationSignalService = new PersonalizationSignalService();
  private readonly behaviorProfileService = new BehaviorProfileService();
  private readonly personalizationPolicyService = new PersonalizationPolicyService();

  async getTodayView(userId: string, options?: { emitEvents?: boolean }): Promise<DailyCommandCenterResponse> {
    const emitEvents = options?.emitEvents ?? true;
    const now = new Date();
    const todayStart = startOfDayUTC(now);

    const [openRows, completedRows, pulseState, upcomingPredictions] = await Promise.all([
      this.repository.listOpenCandidates({ userId }),
      this.repository.listCompletedOrSafeToday({
        userId,
        from: todayStart,
        limit: 24
      }),
      this.pulseService.getPulseState(userId).catch(() => ({
        date: todayStart.toISOString().slice(0, 10),
        openedToday: false,
        openedAt: null,
        totalItems: 0,
        completedCount: 0,
        postponedCount: 0,
        dismissedCount: 0,
        isCompletedForNow: false,
        completedAt: null
      })),
      this.controlTowerService
        .getUpcoming(userId, 3)
        .then((data) => data.items)
        .catch(() => [])
    ]);

    const ranked = this.prioritizationService.rank(
      openRows.map((row) => {
        const mapped = mapObligation(row);
        const category = mapped.obligationIntelligence?.category ?? mapped.type;
        const renewalDate = row.subscription?.nextRenewalDate?.toISOString() ?? null;

        return {
          id: mapped.id,
          itemType: row.subscriptionId ? ("SUBSCRIPTION_REVIEW" as const) : ("OBLIGATION" as const),
          title: mapped.title,
          subtitle: buildSubtitle(mapped.vendor, mapped.dueDate, renewalDate),
          category,
          type: mapped.type,
          status: row.status,
          vendorName: mapped.vendor,
          amount: mapped.amount,
          currency: mapped.currency,
          dueDate: mapped.dueDate,
          renewalDate,
          priorityHintScore: mapped.obligationIntelligence?.priority.score ?? null,
          confidenceBand: mapped.confidenceBand,
          confidenceScore: mapped.confidenceScore,
          urgencyScore: mapped.urgencyScore,
          importanceScore: mapped.importanceScore,
          needsReview: mapped.needsReview,
          sourceSummary: buildSourceSummary(mapped, row.subscription?.vendorName ?? null),
          scopeType: mapped.scopeType,
          assignee: mapped.assignee,
          lastActedAt: mapped.lastActedAt,
          subscriptionId: row.subscriptionId
        };
      }),
      now
    );
    const behaviorProfile = await this.behaviorProfileService
      .getBehaviorProfile(userId)
      .catch(() => null);
    const personalization = this.personalizationPolicyService.applyTodayViewPersonalization({
      items: ranked,
      profile: toBehaviorProfileView(behaviorProfile),
      now
    });
    const personalizedRanked = personalization.items;

    const primaryCandidates = personalizedRanked.filter(
      (item) => item.priorityBand === "URGENT" || item.priorityBand === "HIGH"
    );

    const primaryItems = primaryCandidates.slice(0, 5).map((item) => this.toSurfaceItem(item));
    const primaryIds = new Set(primaryItems.map((item) => item.id));

    const upcomingFromRanked = personalizedRanked
      .filter((item) => !primaryIds.has(item.id))
      .filter((item) => item.priorityBand === "MEDIUM")
      .slice(0, 5)
      .map((item) => this.toSurfaceItem(item));

    const upcoming = mergeUpcomingWithPredictions(upcomingFromRanked, upcomingPredictions).slice(0, 6);

    const completedOrSafe = completedRows.map((item) => {
      const mapped = mapObligation(item);
      const status = toCompletedStatus(item.status);

      return {
        id: mapped.id,
        title: mapped.title,
        status,
        summary: buildCompletedSummary(status, mapped),
        actedAt: mapped.lastActedAt,
        scopeType: mapped.scopeType,
        assignee: mapped.assignee
      } satisfies DailyCommandCenterCompletedItem;
    });

    const summary = {
      todayCount: primaryItems.length,
      urgentCount: primaryItems.filter((item) => item.priorityBand === "URGENT").length,
      reviewCount: primaryItems.filter(
        (item) =>
          item.primaryAction.key === "REVIEW" ||
          item.primaryAction.key === "REVIEW_SUBSCRIPTION"
      ).length,
      upcomingCount: upcoming.length,
      completedTodayCount: completedOrSafe.length
    };

    if (emitEvents) {
      await createAuditEvent({
        userId,
        eventType: "today_view_loaded",
        metadata: {
          todayCount: summary.todayCount,
          urgentCount: summary.urgentCount,
          reviewCount: summary.reviewCount,
          upcomingCount: summary.upcomingCount,
          completedTodayCount: summary.completedTodayCount,
          pulseOpenedToday: pulseState.openedToday,
          pulseTotalItems: pulseState.totalItems
        }
      });

      if (primaryItems.length === 0) {
        await createAuditEvent({
          userId,
          eventType: "today_done_for_now_reached",
          metadata: {
            reason: "no_primary_items"
          }
        });
      }

      if (personalization.personalizationApplied) {
        await createAuditEvent({
          userId,
          eventType: "today_view_personalization_applied",
          metadata: {
            itemCount: personalizedRanked.length,
            rankingApplied: personalization.rankingPersonalizationApplied,
            messagingApplied: personalization.messagingPersonalizationApplied,
            reminderApplied: personalization.reminderPersonalizationApplied,
            presentationStyleCounts: personalization.presentationStyleCounts,
            reminderStyleCounts: personalization.reminderStyleCounts
          }
        });
      } else {
        await createAuditEvent({
          userId,
          eventType: "today_view_personalization_skipped",
          metadata: {
            itemCount: personalizedRanked.length,
            reason: behaviorProfile ? "profile_unknown_or_neutral" : "profile_unavailable"
          }
        });
      }

      if (personalization.messagingPersonalizationApplied) {
        await createAuditEvent({
          userId,
          eventType: "adaptive_message_style_applied",
          metadata: {
            surface: "TODAY_VIEW",
            presentationStyleCounts: personalization.presentationStyleCounts
          }
        });
      }
    }

    void this.recordImpressionSignals(userId, primaryItems).catch(() => null);

    return {
      generatedAt: new Date().toISOString(),
      summary,
      primaryItems,
      upcoming,
      completedOrSafe,
      pulse: {
        openedToday: pulseState.openedToday,
        totalItems: pulseState.totalItems,
        remainingCount: Math.max(0, pulseState.totalItems - pulseState.completedCount),
        completedCount: pulseState.completedCount
      }
    };
  }

  private toSurfaceItem(item: TodayPrioritizedItem | PersonalizedTodayItem): DailyCommandCenterItem {
    const personalized =
      "personalization" in item
        ? {
            presentationStyle: item.presentationStyle,
            reminderStyle: item.reminderStyle,
            personalization: item.personalization
          }
        : {
            presentationStyle: "DEFAULT" as const,
            reminderStyle: "DEFAULT" as const,
            personalization: {
              basePriorityScore: item.priorityScore,
              finalPriorityScore: item.priorityScore,
              personalizationApplied: false,
              presentationStyle: "DEFAULT" as const,
              reminderStyle: "DEFAULT" as const,
              adjustments: []
            }
          };

    return {
      id: item.id,
      itemType: item.itemType,
      title: item.title,
      subtitle: item.subtitle,
      category: item.category,
      vendorName: item.vendorName,
      amount: item.amount,
      currency: item.currency,
      dueDate: item.dueDate,
      renewalDate: item.renewalDate,
      priorityScore: item.priorityScore,
      priorityBand: item.priorityBand,
      confidenceBand: item.confidenceBand,
      primaryAction: item.primaryAction,
      secondaryActions: item.secondaryActions,
      whyNow: item.whyNow,
      whyThisMatters: item.whyThisMatters,
      sourceSummary: item.sourceSummary,
      scopeType: item.scopeType,
      presentationStyle: personalized.presentationStyle,
      reminderStyle: personalized.reminderStyle,
      personalization: personalized.personalization,
      assignee: item.assignee
    };
  }

  private async recordImpressionSignals(
    userId: string,
    items: DailyCommandCenterItem[]
  ) {
    if (items.length === 0) return;

    await this.personalizationSignalService
      .recordSignals(
        items.map((item) => ({
          userId,
          signalType: "ITEM_IMPRESSED" as const,
          obligationId: item.itemType === "OBLIGATION" ? item.id : null,
          itemId: item.id,
          category: item.itemType,
          source: "TODAY_VIEW" as const,
          metadata: {
            priorityBand: item.priorityBand,
            primaryAction: item.primaryAction.key,
            presentationStyle: item.presentationStyle,
            reminderStyle: item.reminderStyle
          }
        }))
      )
      .catch(() => null);
  }
}

function buildSubtitle(vendor: string | null, dueDate: string | null, renewalDate: string | null) {
  const parts: string[] = [];

  if (vendor) {
    parts.push(vendor);
  }

  if (dueDate) {
    parts.push(`Due ${dueDate.slice(0, 10)}`);
  } else if (renewalDate) {
    parts.push(`Renews ${renewalDate.slice(0, 10)}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildSourceSummary(
  obligation: ReturnType<typeof mapObligation>,
  subscriptionVendorName: string | null
) {
  if (subscriptionVendorName && obligation.subscriptionId) {
    return `Linked to subscription lifecycle signals for ${subscriptionVendorName}.`;
  }

  if (obligation.sourceMetadata?.provenanceLabel) {
    return obligation.sourceMetadata.provenanceLabel;
  }

  if (obligation.sourceType === "EMAIL") {
    return "Detected from Gmail billing and lifecycle messages.";
  }

  return "Detected from trusted obligation intelligence signals.";
}

function toCompletedStatus(status: ObligationStatus): DailyCommandCenterCompletedItem["status"] {
  if (status === ObligationStatus.RESOLVED) return "COMPLETED";
  if (status === ObligationStatus.POSTPONED) return "DEFERRED";
  return "SAFE";
}

function buildCompletedSummary(
  status: DailyCommandCenterCompletedItem["status"],
  obligation: ReturnType<typeof mapObligation>
) {
  if (status === "COMPLETED") {
    return `${obligation.title} handled today.`;
  }

  if (status === "DEFERRED") {
    if (obligation.dueDate) {
      return `${obligation.title} moved to ${obligation.dueDate.slice(0, 10)}.`;
    }
    return `${obligation.title} deferred intentionally.`;
  }

  return `${obligation.title} marked safe for now.`;
}

function startOfDayUTC(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function mergeUpcomingWithPredictions(
  upcoming: DailyCommandCenterItem[],
  predictions: Array<{
    id: string;
    title: string;
    description: string | null;
    predictedDate: string | null;
    confidenceBand: "HIGH" | "MEDIUM" | "LOW";
    sourceLabel: string;
  }>
) {
  const merged = [...upcoming];
  const existingTitles = new Set(upcoming.map((item) => item.title.toLowerCase()));

  for (const prediction of predictions) {
    if (existingTitles.has(prediction.title.toLowerCase())) continue;

    merged.push({
      id: `prediction:${prediction.id}`,
      itemType: "OBLIGATION",
      title: prediction.title,
      subtitle: prediction.predictedDate
        ? `Expected ${prediction.predictedDate.slice(0, 10)}`
        : prediction.description,
      category: "UPCOMING",
      vendorName: null,
      amount: null,
      currency: null,
      dueDate: prediction.predictedDate,
      renewalDate: null,
      priorityScore: 48,
      priorityBand: "MEDIUM",
      confidenceBand: prediction.confidenceBand,
      primaryAction: {
        key: "VIEW_DETAILS",
        label: "View details",
        mode: "NAVIGATE",
        href: "/upcoming"
      },
      secondaryActions: [],
      whyNow: prediction.predictedDate
        ? `Likely due around ${prediction.predictedDate.slice(0, 10)}.`
        : "Expected this week from recurring patterns.",
      whyThisMatters: "Looking ahead reduces last-minute decision pressure.",
      sourceSummary: prediction.sourceLabel,
      scopeType: "PERSONAL",
      presentationStyle: "DEFAULT",
      reminderStyle: "DEFAULT",
      personalization: {
        basePriorityScore: 48,
        finalPriorityScore: 48,
        personalizationApplied: false,
        presentationStyle: "DEFAULT",
        reminderStyle: "DEFAULT",
        adjustments: []
      },
      assignee: null
    });
  }

  return merged;
}
