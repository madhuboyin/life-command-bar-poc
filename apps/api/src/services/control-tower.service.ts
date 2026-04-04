import { ObligationStatus, PredictionType } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { ObligationRepository } from "../repositories/obligation.repository";
import { mapObligation } from "../utils/obligation.mapper";
import type { TrustWhy } from "../utils/trust-layer";
import { sourceLabelFromType, toWhyConfidence } from "../utils/trust-layer";
import { AutoFlowService } from "./auto-flow.service";
import { ObligationService } from "./obligation.service";
import { PredictionEngineService } from "./prediction-engine.service";
import { HomeMemoryService } from "./home-memory.service";
import { ZeroInputService } from "./zero-input.service";
import { SubscriptionInsightService } from "./subscription-insight.service";

const DEFAULT_REVIEW_LIMIT = 6;
const DEFAULT_APPROVAL_LIMIT = 6;
const DEFAULT_READY_LIMIT = 6;
const DEFAULT_UPCOMING_LIMIT_PER_WINDOW = 4;
const DEFAULT_RECENT_LIMIT = 6;
const DEFAULT_SYSTEM_DECISIONS_LIMIT = 6;

type ControlTowerReviewItem = {
  id: string;
  itemType: "OBLIGATION" | "PREDICTION";
  obligationId: string | null;
  predictionId: string | null;
  title: string;
  description: string | null;
  sourceLabel: string;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  confidenceScore: number;
  reviewReasons: string[];
  extractedFields: Record<string, unknown> | null;
  predictedDate: string | null;
  status: string;
  why: TrustWhy;
};

type ControlTowerReadyItem = {
  id: string;
  obligationId: string;
  autoFlowId: string | null;
  title: string;
  sourceLabel: string;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  confidenceScore: number;
  priorityScore: number;
  reason: string;
  ctaLabel: string;
  why: TrustWhy;
};

type ControlTowerApprovalItem = {
  id: string;
  decisionId: string;
  title: string;
  description: string | null;
  candidateAction: string;
  sourceLabel: string;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  confidenceScore: number;
  status: string;
  obligationId: string | null;
  predictionId: string | null;
  reminderId: string | null;
  rationaleSummary: string | null;
  createdAt: string;
  why: TrustWhy;
};

type ControlTowerUpcomingItem = {
  id: string;
  predictionId: string;
  obligationId: string | null;
  title: string;
  description: string | null;
  predictedDate: string | null;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  confidenceScore: number;
  predictionType: PredictionType;
  status: string;
  rationaleSummary: string | null;
  sourceLabel: string;
  why: TrustWhy;
};

type ControlTowerRecentItem = {
  id: string;
  eventType: string;
  obligationId: string | null;
  title: string;
  description: string;
  createdAt: string;
  outcomeLabel: string;
  sourceLabel: string;
};

type ControlTowerSystemDecisionItem = {
  id: string;
  decisionType:
    | "SUPPRESSION"
    | "DUPLICATE"
    | "AUTO_FLOW"
    | "PREDICTION"
    | "CONFIDENCE"
    | "ROUTING";
  title: string;
  explanation: string;
  sourceSignals: string[];
  createdAt: string;
  obligationId: string | null;
  referenceId: string | null;
};

type ControlTowerUpcomingSection = {
  windows: Array<{
    windowDays: number;
    start: string;
    end: string;
    items: ControlTowerUpcomingItem[];
  }>;
  items: ControlTowerUpcomingItem[];
};

type ControlTowerSubscriptionOptimizationItem = {
  id: string;
  subscriptionId: string;
  title: string;
  vendorName: string;
  lifecycleState: string;
  recurringPrice: number | null;
  currency: string | null;
  nextRenewalDate: string | null;
  healthScore: number;
  healthBand: "GOOD" | "FAIR" | "AT_RISK";
  insightType: string;
  insightTitle: string;
  insightDescription: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  recommendationType: string;
  recommendationReason: string;
  recommendedAction: string;
  ctaLabel: string;
};

type ControlTowerSubscriptionOptimizationSection = {
  renewingSoon: ControlTowerSubscriptionOptimizationItem[];
  priceIncreased: ControlTowerSubscriptionOptimizationItem[];
  potentiallyUnused: ControlTowerSubscriptionOptimizationItem[];
  needsReview: ControlTowerSubscriptionOptimizationItem[];
};

export class ControlTowerService {
  private readonly obligationService = new ObligationService();
  private readonly obligationRepository = new ObligationRepository();
  private readonly autoFlowService = new AutoFlowService();
  private readonly predictionEngineService = new PredictionEngineService();
  private readonly homeMemoryService = new HomeMemoryService();
  private readonly zeroInputService = new ZeroInputService();
  private readonly subscriptionInsightService = new SubscriptionInsightService();

  async getControlTower(userId: string, options?: {
    reviewLimit?: number;
    approvalLimit?: number;
    readyLimit?: number;
    upcomingLimitPerWindow?: number;
    recentLimit?: number;
    systemDecisionsLimit?: number;
  }) {
    const reviewLimit = options?.reviewLimit ?? DEFAULT_REVIEW_LIMIT;
    const approvalLimit = options?.approvalLimit ?? DEFAULT_APPROVAL_LIMIT;
    const readyLimit = options?.readyLimit ?? DEFAULT_READY_LIMIT;
    const upcomingLimitPerWindow =
      options?.upcomingLimitPerWindow ?? DEFAULT_UPCOMING_LIMIT_PER_WINDOW;
    const recentLimit = options?.recentLimit ?? DEFAULT_RECENT_LIMIT;
    const systemDecisionsLimit =
      options?.systemDecisionsLimit ?? DEFAULT_SYSTEM_DECISIONS_LIMIT;

    const [reviewRaw, approvalsRaw, readyRaw, upcomingRaw, recent, systemDecisions, subscriptionOptimization] = await Promise.all([
      this.getReview(userId, reviewLimit * 2),
      this.getApprovals(userId, approvalLimit * 2),
      this.getReady(userId, readyLimit * 2),
      this.getUpcoming(userId, upcomingLimitPerWindow),
      this.getRecent(userId, recentLimit),
      this.getSystemDecisions(userId, systemDecisionsLimit),
      this.getSubscriptionOptimization(userId, reviewLimit)
    ]);

    const review = reviewRaw.items.slice(0, reviewLimit);
    const approvals = approvalsRaw.items
      .filter((item) => {
        if (item.obligationId && review.some((reviewItem) => reviewItem.obligationId === item.obligationId)) {
          return false;
        }
        if (item.predictionId && review.some((reviewItem) => reviewItem.predictionId === item.predictionId)) {
          return false;
        }
        return true;
      })
      .slice(0, approvalLimit);

    const reviewObligationIds = new Set(
      review
        .map((item) => item.obligationId)
        .filter((item): item is string => Boolean(item))
    );
    const reviewPredictionIds = new Set(
      review
        .map((item) => item.predictionId)
        .filter((item): item is string => Boolean(item))
    );

    const ready = readyRaw.items
      .filter((item) => !reviewObligationIds.has(item.obligationId))
      .slice(0, readyLimit);
    const readyObligationIds = new Set(ready.map((item) => item.obligationId));

    const filteredUpcomingWindows = upcomingRaw.windows.map((window) => ({
      ...window,
      items: window.items
        .filter((item) => {
          if (reviewPredictionIds.has(item.predictionId)) return false;
          if (item.obligationId && reviewObligationIds.has(item.obligationId)) return false;
          if (item.obligationId && readyObligationIds.has(item.obligationId)) return false;
          return true;
        })
        .slice(0, upcomingLimitPerWindow)
    }));
    const upcomingItems = dedupeById(
      filteredUpcomingWindows.flatMap((window) => window.items)
    );

    return {
      generatedAt: new Date().toISOString(),
      review,
      approvals,
      ready,
      upcoming: {
        windows: filteredUpcomingWindows,
        items: upcomingItems
      },
      recent: recent.items,
      systemDecisions: systemDecisions.items,
      subscriptionOptimization,
      summary: {
        reviewCount: review.length,
        approvalCount: approvals.length,
        readyCount: ready.length,
        upcomingCount: upcomingItems.length,
        recentCount: recent.items.length,
        systemDecisionCount: systemDecisions.items.length,
        subscriptionOptimizationCount:
          subscriptionOptimization.renewingSoon.length +
          subscriptionOptimization.priceIncreased.length +
          subscriptionOptimization.potentiallyUnused.length +
          subscriptionOptimization.needsReview.length
      }
    };
  }

  async getSubscriptionOptimization(userId: string, limit = 6) {
    const actions = await this.subscriptionInsightService.listActions(userId, 60);
    const items = actions.flatMap<ControlTowerSubscriptionOptimizationItem>((item) =>
      item.insights.map((insight) => ({
        id: `subscription:${item.subscriptionId}:${insight.insightType}`,
        subscriptionId: item.subscriptionId,
        title: item.subscriptionTitle,
        vendorName: item.vendorName,
        lifecycleState: item.lifecycleState,
        recurringPrice: item.recurringPrice,
        currency: item.currency,
        nextRenewalDate: item.nextRenewalDate,
        healthScore: item.health.score,
        healthBand: item.health.band,
        insightType: insight.insightType,
        insightTitle: insight.title,
        insightDescription: insight.description,
        severity: insight.severity,
        confidence: insight.confidence,
        recommendationType: item.recommendation.recommendationType,
        recommendationReason: item.recommendation.reason,
        recommendedAction: insight.recommendedAction,
        ctaLabel: "Review"
      }))
    );

    const renewingSoon = items
      .filter((item) => item.insightType === "RENEWAL_UPCOMING")
      .sort((a, b) => scoreSubscriptionOptimizationItem(b) - scoreSubscriptionOptimizationItem(a))
      .slice(0, limit);
    const priceIncreased = items
      .filter((item) => item.insightType === "PRICE_INCREASE")
      .sort((a, b) => scoreSubscriptionOptimizationItem(b) - scoreSubscriptionOptimizationItem(a))
      .slice(0, limit);
    const potentiallyUnused = items
      .filter((item) => item.insightType === "UNUSED_RISK")
      .sort((a, b) => scoreSubscriptionOptimizationItem(b) - scoreSubscriptionOptimizationItem(a))
      .slice(0, limit);
    const needsReview = items
      .filter(
        (item) =>
          item.recommendationType === "REVIEW" ||
          item.insightType === "LOW_CONFIDENCE" ||
          item.insightType === "UNKNOWN_STATE" ||
          item.insightType === "PLAN_MISMATCH"
      )
      .sort((a, b) => scoreSubscriptionOptimizationItem(b) - scoreSubscriptionOptimizationItem(a))
      .slice(0, limit);

    return {
      renewingSoon: dedupeSubscriptionOptimizationItems(renewingSoon),
      priceIncreased: dedupeSubscriptionOptimizationItems(priceIncreased),
      potentiallyUnused: dedupeSubscriptionOptimizationItems(potentiallyUnused),
      needsReview: dedupeSubscriptionOptimizationItems(needsReview)
    } satisfies ControlTowerSubscriptionOptimizationSection;
  }

  async getApprovals(userId: string, limit = DEFAULT_APPROVAL_LIMIT) {
    const approvals = await this.zeroInputService.listApprovals(userId, Math.max(limit, 20));

    const items = approvals.items
      .map<ControlTowerApprovalItem>((item) => {
        const reasons = asRecord(item.rationale);
        const reasonLines = Array.isArray(reasons?.reasons)
          ? reasons?.reasons.filter((entry): entry is string => typeof entry === "string")
          : [];
        const primaryReason =
          reasonLines[0] ??
          (item.candidateAction === "PROMOTE_RECURRING_PREDICTION"
            ? "System found a stable recurring pattern."
            : "Approval needed before safe automation.");

        return {
          id: `approval:${item.id}`,
          decisionId: item.id,
          title: item.title,
          description: item.description,
          candidateAction: item.candidateAction,
          sourceLabel: approvalSourceLabel(item.sourceType),
          confidenceBand: item.confidenceBand,
          confidenceScore: item.confidenceScore,
          status: item.approvalStatus,
          obligationId: item.obligationId,
          predictionId: item.predictionId,
          reminderId: item.reminderId,
          rationaleSummary: primaryReason,
          createdAt: item.createdAt,
          why: {
            primaryReason,
            signals: deriveApprovalSignals(item),
            confidence: toWhyConfidence(item.confidenceScore),
            personalizationReason: null
          }
        };
      })
      .slice(0, limit);

    return {
      items
    };
  }

  async getReview(userId: string, limit = DEFAULT_REVIEW_LIMIT) {
    const [reviewQueue, predictionList] = await Promise.all([
      this.obligationService.getReviewQueue(userId, { limit: Math.max(limit, 20) }),
      this.predictionEngineService.list(userId, {
        status: ["ACTIVE"],
        limit: Math.max(limit * 2, 20)
      })
    ]);

    const obligationItems = reviewQueue.items.map<ControlTowerReviewItem>((item) => {
      const reasons = item.reviewReasons.length > 0 ? item.reviewReasons : ["Needs confirmation"];
      const rawData = asRecord(item.sourceMetadata?.rawData);
      const lifecycle = asRecord(rawData?.subscriptionLifecycle);
      const lifecycleExtraction = asRecord(lifecycle?.extraction);
      const lifecycleEmailType =
        typeof lifecycle?.lifecycleEmailType === "string"
          ? lifecycle.lifecycleEmailType
          : null;
      const lifecycleReviewReasons = Array.isArray(asRecord(lifecycle?.confidence)?.reviewReasons)
        ? (asRecord(lifecycle?.confidence)?.reviewReasons as unknown[])
            .filter((entry): entry is string => typeof entry === "string")
        : [];
      const extractedFields = {
        ...(asRecord(item.extractedFields) ?? {}),
        ...(typeof rawData?.from === "string" ? { sender: rawData.from } : {}),
        ...(typeof rawData?.subject === "string" ? { subject: rawData.subject } : {}),
        ...(lifecycleEmailType ? { lifecycle: lifecycleEmailType } : {}),
        ...(typeof lifecycleExtraction?.planName === "string"
          ? { plan: lifecycleExtraction.planName }
          : {}),
        ...(typeof lifecycleExtraction?.recurringPrice === "number"
          ? { recurringPrice: lifecycleExtraction.recurringPrice }
          : {}),
        ...(typeof lifecycleExtraction?.amountCharged === "number"
          ? { amountCharged: lifecycleExtraction.amountCharged }
          : {})
      };
      return {
        id: `obl:${item.id}`,
        itemType: "OBLIGATION",
        obligationId: item.id,
        predictionId: null,
        title: item.title,
        description: item.description,
        sourceLabel: item.sourceMetadata?.provenanceLabel ?? sourceLabelFromType(item.sourceType),
        confidenceBand: item.confidenceBand,
        confidenceScore: item.confidenceScore,
        reviewReasons: Array.from(new Set([...reasons, ...lifecycleReviewReasons])),
        extractedFields,
        predictedDate: item.dueDate,
        status: item.status,
        why: {
          primaryReason: reasons[0] ?? "Needs confirmation",
          signals: deriveReviewSignals(item),
          confidence: toWhyConfidence(item.confidenceScore),
          personalizationReason: null
        }
      };
    });

    const predictionItems = predictionList.items
      .filter((item) => item.needsConfirmation || item.predictionType === "MISSING_EXPECTED_OBLIGATION")
      .map<ControlTowerReviewItem>((item) => {
        const reasons = [
          item.confidenceBand === "LOW"
            ? "Low confidence prediction"
            : "Prediction review suggested"
        ];
        return {
          id: `pred:${item.id}`,
          itemType: "PREDICTION",
          obligationId: item.promotedObligationId,
          predictionId: item.id,
          title: item.title,
          description: item.description,
          sourceLabel: predictionSourceLabel(item.referenceType),
          confidenceBand: item.confidenceBand,
          confidenceScore: item.confidenceScore,
          reviewReasons: reasons,
          extractedFields: asRecord(item.rationale),
          predictedDate: item.predictedDate,
          status: item.status,
          why: {
            primaryReason: item.rationaleSummary ?? "Pattern requires confirmation",
            signals: ["due soon", "recent activity"],
            confidence: toWhyConfidence(item.confidenceScore),
            personalizationReason: null
          }
        };
      });

    const merged = [...obligationItems, ...predictionItems]
      .sort((a, b) => reviewPriorityScore(b) - reviewPriorityScore(a))
      .slice(0, limit);

    return {
      items: merged
    };
  }

  async getReady(userId: string, limit = DEFAULT_READY_LIMIT) {
    const [autoFlow, activeObligations] = await Promise.all([
      this.autoFlowService.list(userId, { limit: Math.max(30, limit * 2) }),
      this.obligationRepository.findActiveForFeed(userId)
    ]);

    const readyFromAutoFlow = autoFlow.items.map<ControlTowerReadyItem>((item) => ({
      id: `ready:auto:${item.id}`,
      obligationId: item.obligationId,
      autoFlowId: item.id,
      title: item.obligation.title,
      sourceLabel: sourceLabelFromType(item.obligation.sourceType),
      confidenceBand: item.obligation.confidenceBand,
      confidenceScore: item.obligation.confidenceScore,
      priorityScore: item.priorityScore,
      reason: item.reason ?? "Ready now",
      ctaLabel: item.cta.label,
      why: item.why
    }));

    const existingObligationIds = new Set(readyFromAutoFlow.map((item) => item.obligationId));

    const fallback = activeObligations
      .map((item) => mapObligation(item))
      .filter((item) => {
        if (existingObligationIds.has(item.id)) return false;
        if (item.needsReview) return false;
        if (item.status !== ObligationStatus.ACTIVE && item.status !== ObligationStatus.POSTPONED) {
          return false;
        }

        const quickWin =
          item.effortLevel === "LOW" &&
          (item.impactLevel === "MEDIUM" || item.impactLevel === "HIGH") &&
          item.importanceScore >= 50;
        const urgent = item.urgencyScore >= 85 || isDueWithinHours(item.dueDate, 48);
        const important = item.importanceScore >= 82;

        return item.confidenceBand === "HIGH" && (quickWin || urgent || important);
      })
      .sort((a, b) => computeReadyPriority(b) - computeReadyPriority(a))
      .map<ControlTowerReadyItem>((item) => {
        const reason = resolveReadyReason(item);
        return {
          id: `ready:obl:${item.id}`,
          obligationId: item.id,
          autoFlowId: null,
          title: item.title,
          sourceLabel: sourceLabelFromType(item.sourceType),
          confidenceBand: item.confidenceBand,
          confidenceScore: item.confidenceScore,
          priorityScore: computeReadyPriority(item),
          reason,
          ctaLabel: "Start",
          why: {
            primaryReason: reason,
            signals: deriveReadySignals(item),
            confidence: toWhyConfidence(item.confidenceScore),
            personalizationReason: null
          }
        };
      });

    const merged = dedupeByObligationId([...readyFromAutoFlow, ...fallback]).slice(0, limit);

    return {
      items: merged
    };
  }

  async getUpcoming(userId: string, limitPerWindow = DEFAULT_UPCOMING_LIMIT_PER_WINDOW) {
    const upcoming = await this.predictionEngineService.listUpcoming(userId);

    const windows = upcoming.windows.map((window) => ({
      windowDays: window.windowDays,
      start: window.start,
      end: window.end,
      items: window.items
        .filter((item) => item.status === "ACTIVE" || item.status === "CONFIRMED")
        .slice(0, limitPerWindow)
        .map((item) => this.mapUpcomingPrediction(item))
    }));

    const items = dedupeById(windows.flatMap((window) => window.items));

    return {
      windows,
      items
    } satisfies ControlTowerUpcomingSection;
  }

  async getRecent(userId: string, limit = DEFAULT_RECENT_LIMIT) {
    const events = await prisma.auditEvent.findMany({
      where: {
        userId,
        eventType: {
          in: [
            "obligation_marked_done",
            "obligation_postponed",
            "obligation_dismissed",
            "ingestion_candidate_confirmed",
            "ingestion_candidate_rejected",
            "gmail_candidate_reviewed",
            "gmail_candidate_rejected",
            "auto_flow_accepted",
            "focus_session_completed",
            "focus_session_item_completed",
            "guided_journey_completed",
            "prediction_confirmed",
            "prediction_promoted_to_obligation",
            "subscription_registry_created",
            "subscription_price_changed",
            "subscription_cancellation_detected"
          ]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: Math.max(limit * 3, 30)
    });

    const items = events
      .map<ControlTowerRecentItem>((event) => {
        const metadata = asRecord(event.metadata);
        const { title, description, outcomeLabel } = toRecentDescription(event.eventType, metadata);
        return {
          id: event.id,
          eventType: event.eventType,
          obligationId: event.obligationId,
          title,
          description,
          createdAt: event.createdAt.toISOString(),
          outcomeLabel,
          sourceLabel: sourceLabelFromRecentEvent(event.eventType)
        };
      })
      .slice(0, limit);

    return {
      items
    };
  }

  async getSystemDecisions(userId: string, limit = DEFAULT_SYSTEM_DECISIONS_LIMIT) {
    const [auditEvents, suppressedPatterns, memoryEvents, autonomyDecisions] = await Promise.all([
      prisma.auditEvent.findMany({
        where: {
          userId,
          eventType: {
            in: [
              "ingestion_duplicate_detected",
              "ingestion_structured_duplicate_detected",
              "ingestion_candidate_skipped",
              "gmail_candidate_skipped",
              "gmail_duplicate_suppressed",
              "gmail_prediction_strengthened",
              "gmail_subscription_matched_existing",
              "gmail_subscription_conflict_detected",
              "gmail_subscription_cancellation_detected",
              "subscription_registry_created",
              "subscription_registry_updated",
              "subscription_registry_merged",
              "subscription_lifecycle_transitioned",
              "subscription_price_changed",
              "subscription_cancellation_detected",
              "subscription_prediction_strengthened",
              "subscription_insight_created",
              "subscription_recommendation_generated",
              "subscription_decision_taken",
              "subscription_kept",
              "subscription_marked_for_cancel",
              "gmail_sync_error",
              "auto_flow_triggered",
              "prediction_rebuilt",
              "prediction_resolved_by_ingestion",
              "prediction_dismissed",
              "daily_pulse_item_reconciled"
            ]
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: Math.max(limit * 3, 30)
      }),
      this.homeMemoryService
        .listPatterns(userId, { includeSuppressed: true, limit: Math.max(limit, 20) })
        .then((result) => result.items.filter((item) => item.isSuppressed))
        .catch(() => []),
      prisma.memoryEvent.findMany({
        where: {
          userId,
          eventType: {
            in: ["prediction_pattern_dismissed", "prediction_pattern_confirmed"]
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: Math.max(limit, 20)
      }),
      this.zeroInputService
        .listDecisions(userId, {
          limit: Math.max(limit * 3, 30),
          decision: ["EXECUTED", "SUPPRESSED", "REVIEW"],
          approvalStatus: ["NONE", "APPROVED", "REJECTED", "UNDONE"]
        })
        .then((result) => result.items)
        .catch(() => [])
    ]);

    const auditItems = auditEvents.map((event) => {
      const metadata = asRecord(event.metadata);
      return toSystemDecisionFromAudit(event, metadata);
    });

    const suppressedItems: ControlTowerSystemDecisionItem[] = suppressedPatterns.map((pattern) => ({
      id: `suppressed:${pattern.id}`,
      decisionType: "SUPPRESSION",
      title: "Pattern suppressed",
      explanation: "Suppressed after repeated low-value outcomes.",
      sourceSignals: [
        `pattern:${pattern.patternType.toLowerCase()}`,
        `confidence:${Math.round(pattern.confidence * 100)}`
      ],
      createdAt: pattern.updatedAt,
      obligationId: null,
      referenceId: pattern.referenceId
    }));

    const memoryItems: ControlTowerSystemDecisionItem[] = memoryEvents.map((event) => {
      const metadata = asRecord(event.metadata);
      const confidenceBefore = asNumber(metadata?.confidenceBefore);
      const confidenceAfter = asNumber(metadata?.confidenceAfter);
      const explainedDelta =
        confidenceBefore !== null && confidenceAfter !== null
          ? `Confidence adjusted from ${Math.round(confidenceBefore * 100)}% to ${Math.round(confidenceAfter * 100)}%.`
          : "Prediction confidence updated from outcome feedback.";

      return {
        id: `memory:${event.id}`,
        decisionType: "CONFIDENCE",
        title:
          event.eventType === "prediction_pattern_dismissed"
            ? "Confidence downgraded"
            : "Confidence reinforced",
        explanation: explainedDelta,
        sourceSignals: [event.eventType],
        createdAt: event.createdAt.toISOString(),
        obligationId: null,
        referenceId: event.referenceId
      };
    });

    const autonomyItems: ControlTowerSystemDecisionItem[] = autonomyDecisions.map((item) => ({
      id: `autonomy:${item.id}`,
      decisionType: toSystemDecisionTypeFromAutonomy(item),
      title: item.title,
      explanation: autonomyExplanation(item),
      sourceSignals: buildAutonomySignals(item),
      createdAt: item.createdAt,
      obligationId: item.obligationId,
      referenceId: item.referenceId
    }));

    const items = [...auditItems, ...suppressedItems, ...memoryItems, ...autonomyItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return {
      items
    };
  }

  private mapUpcomingPrediction(item: {
    id: string;
    predictionType: PredictionType;
    referenceType: "MEMORY_PATTERN" | "MEMORY_ENTITY" | "OBLIGATION" | "VENDOR";
    referenceId: string;
    title: string;
    description: string | null;
    predictedDate: string | null;
    confidenceScore: number;
    confidenceBand: "HIGH" | "MEDIUM" | "LOW";
    status: "ACTIVE" | "CONFIRMED" | "DISMISSED" | "EXPIRED" | "PROMOTED_TO_OBLIGATION";
    rationaleSummary: string | null;
    promotedObligationId: string | null;
  }): ControlTowerUpcomingItem {
    const sourceSignals = [item.predictionType.toLowerCase()];
    const primaryReason =
      item.rationaleSummary ??
      (item.predictionType === "WORKLOAD_WINDOW"
        ? "Upcoming workload signal"
        : "Pattern suggests this is coming soon");

    return {
      id: `upcoming:${item.id}`,
      predictionId: item.id,
      obligationId:
        item.referenceType === "OBLIGATION"
          ? item.referenceId
          : item.promotedObligationId,
      title: item.title,
      description: item.description,
      predictedDate: item.predictedDate,
      confidenceBand: item.confidenceBand,
      confidenceScore: item.confidenceScore,
      predictionType: item.predictionType,
      status: item.status,
      rationaleSummary: item.rationaleSummary,
      sourceLabel: predictionSourceLabel(item.referenceType),
      why: {
        primaryReason,
        signals: sourceSignals,
        confidence: toWhyConfidence(item.confidenceScore),
        personalizationReason: null
      }
    };
  }
}

function predictionSourceLabel(referenceType: string) {
  if (referenceType === "OBLIGATION") return "Predicted from obligation history";
  if (referenceType === "MEMORY_PATTERN") return "Predicted from memory pattern";
  if (referenceType === "MEMORY_ENTITY") return "Predicted from system context";
  return "Predicted from vendor pattern";
}

function reviewPriorityScore(item: ControlTowerReviewItem) {
  let score = item.confidenceBand === "LOW" ? 50 : item.confidenceBand === "MEDIUM" ? 35 : 15;
  if (item.reviewReasons.some((reason) => reason.toLowerCase().includes("conflict"))) score += 20;
  if (item.reviewReasons.some((reason) => reason.toLowerCase().includes("duplicate"))) score += 15;
  if (item.itemType === "PREDICTION") score += 8;
  return score;
}

function deriveReviewSignals(item: {
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  conflictDetected?: boolean;
  duplicateCandidate?: boolean;
  extractionStatus?: string | null;
}) {
  const signals: string[] = [];
  if (item.confidenceBand !== "HIGH") signals.push("high importance");
  if (item.conflictDetected) signals.push("recent activity");
  if (item.duplicateCandidate) signals.push("recent activity");
  if (item.extractionStatus === "PARTIAL" || item.extractionStatus === "FAILED") {
    signals.push("quick win");
  }
  if (signals.length === 0) {
    signals.push("high importance");
  }
  return Array.from(new Set(signals));
}

function computeReadyPriority(item: {
  urgencyScore: number;
  importanceScore: number;
  confidenceScore: number;
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  dueDate: string | null;
}) {
  let score = item.urgencyScore * 0.4 + item.importanceScore * 0.35 + item.confidenceScore * 100 * 0.25;

  if (isDueWithinHours(item.dueDate, 48)) score += 10;
  if (item.effortLevel === "LOW" && (item.impactLevel === "MEDIUM" || item.impactLevel === "HIGH")) {
    score += 8;
  }

  return Math.round(score);
}

function resolveReadyReason(item: {
  urgencyScore: number;
  dueDate: string | null;
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  amount: number | null;
}) {
  if (item.urgencyScore >= 85 || isDueWithinHours(item.dueDate, 48)) {
    return "Needs attention soon";
  }

  if (item.effortLevel === "LOW" && (item.impactLevel === "MEDIUM" || item.impactLevel === "HIGH")) {
    return "Quick win with strong impact";
  }

  if ((item.amount ?? 0) > 0) {
    return "Money exposure worth handling now";
  }

  return "Ready to act";
}

function deriveReadySignals(item: {
  urgencyScore: number;
  dueDate: string | null;
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  amount: number | null;
}) {
  const signals: string[] = [];
  if (item.urgencyScore >= 85 || isDueWithinHours(item.dueDate, 48)) {
    signals.push("due soon");
  }
  if (item.effortLevel === "LOW" && (item.impactLevel === "MEDIUM" || item.impactLevel === "HIGH")) {
    signals.push("quick win");
  }
  if ((item.amount ?? 0) > 0) {
    signals.push("money exposure");
  }
  if (signals.length === 0) {
    signals.push("high importance");
  }
  return signals;
}

function toRecentDescription(eventType: string, metadata: Record<string, unknown> | null) {
  switch (eventType) {
    case "obligation_marked_done":
      return {
        title: "Obligation completed",
        description: "Marked complete and removed from active queue.",
        outcomeLabel: "Completed"
      };
    case "obligation_postponed":
      return {
        title: "Obligation postponed",
        description: "Deferred intentionally with updated timing.",
        outcomeLabel: "Postponed"
      };
    case "obligation_dismissed":
      return {
        title: "Obligation dismissed",
        description: "Removed from active recommendations.",
        outcomeLabel: "Dismissed"
      };
    case "auto_flow_accepted":
      return {
        title: "Ready-now flow accepted",
        description: "A prepared action flow was opened from system recommendations.",
        outcomeLabel: "Accepted"
      };
    case "guided_journey_completed":
      return {
        title: "Guided flow completed",
        description: "A guided journey was completed end-to-end.",
        outcomeLabel: "Completed"
      };
    case "prediction_promoted_to_obligation":
      return {
        title: "Prediction promoted",
        description: "A predicted item was promoted into an obligation.",
        outcomeLabel: "Promoted"
      };
    case "prediction_confirmed":
      return {
        title: "Prediction confirmed",
        description: "A future signal was confirmed and retained.",
        outcomeLabel: "Confirmed"
      };
    case "subscription_registry_created":
      return {
        title: "Subscription discovered",
        description: "A canonical subscription record was created from lifecycle evidence.",
        outcomeLabel: "Discovered"
      };
    case "subscription_price_changed":
      return {
        title: "Subscription price changed",
        description: "The recurring price changed and was logged for review.",
        outcomeLabel: "Updated"
      };
    case "subscription_cancellation_detected":
      return {
        title: "Subscription cancellation detected",
        description: "Cancellation evidence was captured and lifecycle state updated.",
        outcomeLabel: "Updated"
      };
    case "ingestion_candidate_confirmed":
      return {
        title: "Imported item confirmed",
        description: "A captured ingestion candidate was confirmed by user action.",
        outcomeLabel: "Confirmed"
      };
    case "ingestion_candidate_rejected":
      return {
        title: "Imported item rejected",
        description: "A captured ingestion candidate was rejected.",
        outcomeLabel: "Rejected"
      };
    case "gmail_candidate_reviewed":
      return {
        title: "Gmail candidate confirmed",
        description: "A Gmail-derived candidate was reviewed and confirmed.",
        outcomeLabel: "Confirmed"
      };
    case "gmail_candidate_rejected":
      return {
        title: "Gmail candidate rejected",
        description: "A Gmail-derived candidate was reviewed and rejected.",
        outcomeLabel: "Rejected"
      };
    default:
      return {
        title: normalizeEventLabel(eventType),
        description:
          (typeof metadata?.reason === "string" && metadata.reason.length > 0
            ? metadata.reason
            : "Recent system or user action recorded.") ?? "Recent action recorded.",
        outcomeLabel: "Recorded"
      };
  }
}

function sourceLabelFromRecentEvent(eventType: string) {
  if (eventType.startsWith("gmail_")) return "Gmail";
  if (eventType.startsWith("subscription_")) return "Subscription Registry";
  if (eventType.startsWith("prediction_")) return "Prediction Engine";
  if (eventType.startsWith("auto_flow_")) return "Auto-Flow";
  if (eventType.startsWith("ingestion_")) return "Ingestion";
  if (eventType.startsWith("guided_journey_")) return "Guided Mode";
  if (eventType.startsWith("focus_")) return "Focus Mode";
  return "System";
}

function toSystemDecisionFromAudit(
  event: {
    id: string;
    eventType: string;
    obligationId: string | null;
    createdAt: Date;
  },
  metadata: Record<string, unknown> | null
): ControlTowerSystemDecisionItem {
  if (event.eventType === "gmail_duplicate_suppressed") {
    return {
      id: event.id,
      decisionType: "DUPLICATE",
      title: "Duplicate Gmail message suppressed",
      explanation: "A previously processed or duplicate Gmail message was suppressed.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.reason === "string" ? metadata.reason : "duplicate_detected"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.gmailMessageId === "string" ? metadata.gmailMessageId : null
    };
  }

  if (event.eventType === "gmail_prediction_strengthened") {
    return {
      id: event.id,
      decisionType: "PREDICTION",
      title: "Recurring signal strengthened",
      explanation: "Gmail activity reinforced an existing recurring obligation pattern.",
      sourceSignals: [event.eventType, "gmail_recurring_signal"],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.gmailMessageId === "string" ? metadata.gmailMessageId : null
    };
  }

  if (event.eventType === "gmail_subscription_matched_existing") {
    return {
      id: event.id,
      decisionType: "PREDICTION",
      title: "Subscription lifecycle matched existing item",
      explanation:
        "A Gmail lifecycle email matched an existing subscription, so duplicate creation was suppressed.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.lifecycleEmailType === "string"
          ? `lifecycle:${String(metadata.lifecycleEmailType).toLowerCase()}`
          : "lifecycle:unknown"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.importSourceId === "string" ? metadata.importSourceId : null
    };
  }

  if (event.eventType === "gmail_subscription_conflict_detected") {
    return {
      id: event.id,
      decisionType: "ROUTING",
      title: "Conflicting subscription lifecycle signal",
      explanation:
        "A Gmail lifecycle signal conflicted with existing subscription state and was routed for review.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.reason === "string" ? metadata.reason : "lifecycle_conflict"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.importSourceId === "string" ? metadata.importSourceId : null
    };
  }

  if (event.eventType === "gmail_subscription_cancellation_detected") {
    return {
      id: event.id,
      decisionType: "SUPPRESSION",
      title: "Cancellation signal applied",
      explanation:
        "A Gmail cancellation email reduced future recurring expectations for this subscription.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.autoRenewStatus === "string"
          ? `auto_renew:${String(metadata.autoRenewStatus).toLowerCase()}`
          : "auto_renew:unknown"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.importSourceId === "string" ? metadata.importSourceId : null
    };
  }

  if (event.eventType === "subscription_registry_created") {
    return {
      id: event.id,
      decisionType: "PREDICTION",
      title: "Canonical subscription created",
      explanation:
        "Lifecycle evidence was consolidated into a canonical subscription record.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.lifecycleEmailType === "string"
          ? `lifecycle:${String(metadata.lifecycleEmailType).toLowerCase()}`
          : "lifecycle:unknown"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_registry_updated") {
    return {
      id: event.id,
      decisionType: "PREDICTION",
      title: "Subscription registry updated",
      explanation:
        "New lifecycle evidence updated an existing canonical subscription state.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.nextState === "string"
          ? `state:${String(metadata.nextState).toLowerCase()}`
          : "state:updated"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_registry_merged") {
    return {
      id: event.id,
      decisionType: "DUPLICATE",
      title: "Duplicate subscriptions merged",
      explanation:
        "Two subscription records were merged to keep one canonical subscription object.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.duplicateSubscriptionId === "string"
          ? `merged:${metadata.duplicateSubscriptionId}`
          : "merged:duplicate"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.primarySubscriptionId === "string"
          ? metadata.primarySubscriptionId
          : null
    };
  }

  if (event.eventType === "subscription_price_changed") {
    return {
      id: event.id,
      decisionType: "CONFIDENCE",
      title: "Subscription price change detected",
      explanation:
        "A pricing signal changed the known recurring cost for a subscription.",
      sourceSignals: [event.eventType],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_cancellation_detected") {
    return {
      id: event.id,
      decisionType: "SUPPRESSION",
      title: "Subscription cancellation detected",
      explanation:
        "Cancellation evidence reduced future renewal expectations for this subscription.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.nextState === "string"
          ? `state:${String(metadata.nextState).toLowerCase()}`
          : "state:canceled"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_lifecycle_transitioned") {
    return {
      id: event.id,
      decisionType: "ROUTING",
      title: "Subscription lifecycle transitioned",
      explanation:
        "Lifecycle state was deterministically updated based on new evidence.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.previousState === "string"
          ? `from:${String(metadata.previousState).toLowerCase()}`
          : "from:unknown",
        typeof metadata?.nextState === "string"
          ? `to:${String(metadata.nextState).toLowerCase()}`
          : "to:unknown"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_prediction_strengthened") {
    return {
      id: event.id,
      decisionType: "PREDICTION",
      title: "Subscription prediction strengthened",
      explanation:
        "Additional lifecycle evidence increased confidence in recurring predictions.",
      sourceSignals: [event.eventType],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_insight_created") {
    return {
      id: event.id,
      decisionType: "CONFIDENCE",
      title: "Subscription insight generated",
      explanation: "Optimization engine produced a high-signal subscription insight.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.insightType === "string"
          ? `insight:${String(metadata.insightType).toLowerCase()}`
          : "insight:unknown"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_recommendation_generated") {
    return {
      id: event.id,
      decisionType: "ROUTING",
      title: "Subscription recommendation generated",
      explanation: "Deterministic recommendation was generated from subscription lifecycle insights.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.recommendationType === "string"
          ? `recommendation:${String(metadata.recommendationType).toLowerCase()}`
          : "recommendation:unknown"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_decision_taken") {
    return {
      id: event.id,
      decisionType: "ROUTING",
      title: "Subscription decision applied",
      explanation: "A guided subscription decision updated recommendation state.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.decision === "string"
          ? `decision:${String(metadata.decision).toLowerCase()}`
          : "decision:unknown"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_kept") {
    return {
      id: event.id,
      decisionType: "PREDICTION",
      title: "Subscription marked keep",
      explanation: "User confirmed this subscription should remain active.",
      sourceSignals: [event.eventType],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "subscription_marked_for_cancel") {
    return {
      id: event.id,
      decisionType: "SUPPRESSION",
      title: "Subscription marked for cancellation",
      explanation: "User selected cancel path and lifecycle state was moved toward cancellation.",
      sourceSignals: [event.eventType],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.subscriptionId === "string" ? metadata.subscriptionId : null
    };
  }

  if (event.eventType === "gmail_candidate_skipped") {
    return {
      id: event.id,
      decisionType: "ROUTING",
      title: "Gmail candidate routed to review",
      explanation: "A Gmail-derived signal had insufficient confidence and was routed to review.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.reason === "string" ? metadata.reason : "insufficient_signal"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.gmailMessageId === "string" ? metadata.gmailMessageId : null
    };
  }

  if (event.eventType === "gmail_sync_error") {
    return {
      id: event.id,
      decisionType: "ROUTING",
      title: "Gmail sync error handled",
      explanation: "A Gmail message failed to sync and was safely skipped.",
      sourceSignals: [event.eventType, typeof metadata?.error === "string" ? metadata.error : "sync_error"],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.gmailMessageId === "string" ? metadata.gmailMessageId : null
    };
  }

  if (
    event.eventType === "ingestion_duplicate_detected" ||
    event.eventType === "ingestion_structured_duplicate_detected"
  ) {
    return {
      id: event.id,
      decisionType: "DUPLICATE",
      title: "Duplicate detected and suppressed",
      explanation: "A similar capture already exists, so this item was suppressed.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.duplicateOfObligationId === "string"
          ? `match:${metadata.duplicateOfObligationId}`
          : "match:existing"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.importSourceId === "string" ? metadata.importSourceId : null
    };
  }

  if (event.eventType === "ingestion_candidate_skipped") {
    return {
      id: event.id,
      decisionType: "ROUTING",
      title: "Moved to review",
      explanation:
        typeof metadata?.reason === "string" && metadata.reason === "conflict_detected"
          ? "Conflicting signals were detected, so this item was routed to review."
          : "Confidence was insufficient for activation, so this item was routed to review.",
      sourceSignals: [event.eventType, typeof metadata?.reason === "string" ? metadata.reason : "low_confidence"],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId: typeof metadata?.importSourceId === "string" ? metadata.importSourceId : null
    };
  }

  if (event.eventType === "auto_flow_triggered") {
    return {
      id: event.id,
      decisionType: "AUTO_FLOW",
      title: "Auto-flow triggered",
      explanation: "A ready/suggested flow was created based on urgency and confidence.",
      sourceSignals: [
        event.eventType,
        typeof metadata?.triggerType === "string" ? metadata.triggerType : "pattern_trigger"
      ],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.autoFlowStateId === "string" ? metadata.autoFlowStateId : null
    };
  }

  if (event.eventType === "prediction_rebuilt" || event.eventType === "prediction_resolved_by_ingestion") {
    return {
      id: event.id,
      decisionType: "PREDICTION",
      title:
        event.eventType === "prediction_rebuilt"
          ? "Predictions rebuilt"
          : "Prediction resolved by real capture",
      explanation:
        event.eventType === "prediction_rebuilt"
          ? "Future signals were recalculated from updated memory and obligations."
          : "A predicted item was matched to a newly captured obligation.",
      sourceSignals: [event.eventType],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.predictionId === "string" ? metadata.predictionId : null
    };
  }

  if (event.eventType === "prediction_dismissed") {
    return {
      id: event.id,
      decisionType: "CONFIDENCE",
      title: "Prediction confidence reduced",
      explanation: "Dismissed predictions lower confidence for similar future predictions.",
      sourceSignals: [event.eventType],
      createdAt: event.createdAt.toISOString(),
      obligationId: event.obligationId,
      referenceId:
        typeof metadata?.predictionId === "string" ? metadata.predictionId : null
    };
  }

  return {
    id: event.id,
    decisionType: "ROUTING",
    title: normalizeEventLabel(event.eventType),
    explanation: "System decision captured for auditability.",
    sourceSignals: [event.eventType],
    createdAt: event.createdAt.toISOString(),
    obligationId: event.obligationId,
    referenceId: null
  };
}

function isDueWithinHours(value: string | null, hours: number) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() <= Date.now() + hours * 60 * 60 * 1000;
}

function dedupeByObligationId(items: ControlTowerReadyItem[]) {
  const seen = new Set<string>();
  const deduped: ControlTowerReadyItem[] = [];
  for (const item of items) {
    if (seen.has(item.obligationId)) continue;
    seen.add(item.obligationId);
    deduped.push(item);
  }
  return deduped;
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

function dedupeSubscriptionOptimizationItems(items: ControlTowerSubscriptionOptimizationItem[]) {
  const seen = new Set<string>();
  const output: ControlTowerSubscriptionOptimizationItem[] = [];
  for (const item of items) {
    const key = `${item.subscriptionId}:${item.insightType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function scoreSubscriptionOptimizationItem(item: ControlTowerSubscriptionOptimizationItem) {
  let score = item.healthScore;
  if (item.severity === "HIGH") score += 24;
  if (item.severity === "MEDIUM") score += 14;
  if (item.recommendationType === "REVIEW") score += 10;
  if (item.recommendationType === "CANCEL") score += 14;
  if (item.insightType === "RENEWAL_UPCOMING") score += 16;
  if (item.insightType === "PRICE_INCREASE") score += 18;
  if (item.insightType === "UNUSED_RISK") score += 12;
  return score;
}

function normalizeEventLabel(eventType: string) {
  return eventType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function approvalSourceLabel(sourceType: string) {
  const normalized = sourceType.toLowerCase();
  if (normalized.includes("email")) return "Imported from email";
  if (normalized.includes("upload") || normalized.includes("document")) {
    return "Extracted from upload";
  }
  if (normalized.includes("command")) return "Captured from command";
  if (normalized.includes("prediction")) return "Predicted from recurring pattern";
  return "System automation";
}

function deriveApprovalSignals(item: {
  candidateAction: string;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
}) {
  const signals: string[] = [];
  if (item.candidateAction === "PROMOTE_RECURRING_PREDICTION") {
    signals.push("recent activity");
    signals.push("due soon");
  }
  if (item.candidateAction === "AUTO_CREATE_REMINDER") {
    signals.push("quick win");
  }
  if (item.confidenceBand !== "HIGH") {
    signals.push("high importance");
  }
  if (signals.length === 0) {
    signals.push("high importance");
  }
  return Array.from(new Set(signals));
}

function toSystemDecisionTypeFromAutonomy(item: {
  candidateAction: string;
  decision: string;
  approvalStatus: string;
}) {
  if (item.candidateAction === "SUPPRESS_DUPLICATE") return "DUPLICATE" as const;
  if (item.candidateAction === "PREPARE_AUTO_FLOW") return "AUTO_FLOW" as const;
  if (item.candidateAction === "PROMOTE_RECURRING_PREDICTION") return "PREDICTION" as const;
  if (item.decision === "REVIEW" || item.approvalStatus === "PENDING") return "ROUTING" as const;
  return "CONFIDENCE" as const;
}

function autonomyExplanation(item: {
  candidateAction: string;
  decision: string;
  approvalStatus: string;
  title: string;
  rationale: Record<string, unknown> | null;
}) {
  const reasons = Array.isArray(item.rationale?.reasons)
    ? item.rationale?.reasons.filter((entry): entry is string => typeof entry === "string")
    : [];
  const reason = reasons[0] ?? null;

  if (item.decision === "APPROVAL_REQUIRED" && item.approvalStatus === "PENDING") {
    return reason
      ? `Awaiting user approval: ${reason.replace(/_/g, " ")}.`
      : "Awaiting user approval before automation executes.";
  }
  if (item.decision === "SUPPRESSED") {
    return reason ? `Suppressed by guardrail: ${reason.replace(/_/g, " ")}.` : "Suppressed by guardrail.";
  }
  if (item.decision === "REVIEW") {
    return reason ? `Routed to review: ${reason.replace(/_/g, " ")}.` : "Routed to review by guardrails.";
  }
  if (item.candidateAction === "PROMOTE_RECURRING_PREDICTION") {
    return "Recurring prediction was promoted under safe automation rules.";
  }
  return item.title;
}

function buildAutonomySignals(item: {
  candidateAction: string;
  decision: string;
  approvalStatus: string;
  rationale: Record<string, unknown> | null;
}) {
  const signals: string[] = [item.candidateAction.toLowerCase(), item.decision.toLowerCase()];
  if (item.approvalStatus !== "NONE") {
    signals.push(`approval:${item.approvalStatus.toLowerCase()}`);
  }

  const reasons = Array.isArray(item.rationale?.reasons)
    ? item.rationale?.reasons.filter((entry): entry is string => typeof entry === "string")
    : [];
  for (const reason of reasons.slice(0, 3)) {
    signals.push(reason);
  }

  return signals;
}
