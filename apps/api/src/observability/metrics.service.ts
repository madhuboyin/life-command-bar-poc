import { MetricTimeBucket, Prisma } from "@prisma/client";
import { MetricsRepository } from "./metrics.repository";

type ScopeFilters = {
  userId?: string;
  householdId?: string;
};

type PeriodWindow = {
  start: Date;
  end: Date;
  bucketStart: Date;
};

type PeriodMetrics = {
  bucket: "DAY" | "WEEK" | "MONTH";
  window: {
    start: string;
    end: string;
  };
  systemHealth: {
    ingestionVolume: number;
    predictionVolume: number;
    autoFlowVolume: number;
  };
  ingestionQuality: {
    totalIngestions: number;
    highConfidenceRate: number;
    mediumConfidenceRate: number;
    lowConfidenceRate: number;
    correctedRate: number;
    rejectedRate: number;
    duplicateRate: number;
  };
  predictionAccuracy: {
    confirmedRate: number;
    dismissedRate: number;
    promotedRate: number;
    confidenceOutcomeCorrelation: number;
  };
  automationPerformance: {
    acceptedRate: number;
    dismissedRate: number;
    ignoredRate: number;
    avgTimeToActionMinutes: number;
    autonomySuccessRate: number;
  };
  executionLayer: {
    guidedCompletionRate: number;
    guidedDropOffRate: number;
    avgStepsPerSession: number;
    stepDropOff: Array<{ stepKey: string; completionRate: number; completedCount: number }>;
  };
  trustAndCorrection: {
    correctionsPerSession: number;
    reviewQueueSize: number;
    approvalQueueSize: number;
    rejectionRate: number;
    correctionRate: number;
  };
  householdMetrics: {
    collaborationEfficiency: number;
    assignmentBalance: number;
    assignmentMismatchRate: number;
    reassignmentFrequency: number;
    unclaimedItemsRate: number;
  };
  autonomySafety: {
    totalAutoActions: number;
    undoneRate: number;
    overriddenRate: number;
    requiringApprovalRate: number;
  };
  llmOptimization: {
    totalRequests: number;
    executedCalls: number;
    cacheHitRate: number;
    gateSkipRate: number;
    failureRate: number;
    avgLatencyMs: number;
    estimatedCostUsd: number;
    asyncEnqueued: number;
    resolvedWithoutProviderRate: number;
    lowCostTierRate: number;
    reasoningTierRate: number;
    premiumTierRate: number;
    gmailFallbackRate: number;
  };
  qualityScores: {
    ingestionQualityScore: number;
    predictionAccuracyScore: number;
    automationEffectivenessScore: number;
    trustScore: number;
  };
};

export class MetricsService {
  private readonly repository = new MetricsRepository();

  async getMetricsOverview(filters?: ScopeFilters) {
    await this.refreshSnapshotsIfStale(filters);

    const [day, week, month] = await Promise.all([
      this.calculatePeriodMetrics("DAY", filters, true),
      this.calculatePeriodMetrics("WEEK", filters, true),
      this.calculatePeriodMetrics("MONTH", filters, true)
    ]);

    return {
      generatedAt: new Date().toISOString(),
      periods: {
        day,
        week,
        month
      },
      qualityScores: day.qualityScores
    };
  }

  async getMetricByType(input: {
    metricType: string;
    timeBucket?: "DAY" | "WEEK" | "MONTH";
    limit?: number;
    userId?: string;
    householdId?: string;
  }) {
    const snapshots = await this.repository.listSnapshots({
      metricType: input.metricType,
      timeBucket: toMetricTimeBucket(input.timeBucket ?? "DAY"),
      limit: clamp(input.limit ?? 60, 1, 365),
      dimensionKey: toDimensionKey({
        userId: input.userId,
        householdId: input.householdId
      })
    });

    return {
      metricType: input.metricType,
      timeBucket: input.timeBucket ?? "DAY",
      points: snapshots
        .map((snapshot) => ({
          timestamp: snapshot.timestamp.toISOString(),
          value: Number(snapshot.value),
          dimension: asRecord(snapshot.dimension)
        }))
        .reverse()
    };
  }

  async getTrends(input?: {
    metricTypes?: string[];
    timeBucket?: "DAY" | "WEEK" | "MONTH";
    limit?: number;
    userId?: string;
    householdId?: string;
  }) {
    const metricTypes =
      input?.metricTypes && input.metricTypes.length > 0
        ? Array.from(new Set(input.metricTypes))
        : DEFAULT_TREND_METRICS;

    const timeBucket = input?.timeBucket ?? "DAY";
    const dimensionKey = toDimensionKey({
      userId: input?.userId,
      householdId: input?.householdId
    });

    const all = await Promise.all(
      metricTypes.map((metricType) =>
        this.repository.listSnapshots({
          metricType,
          timeBucket: toMetricTimeBucket(timeBucket),
          limit: clamp(input?.limit ?? 30, 1, 180),
          dimensionKey
        })
      )
    );

    return {
      timeBucket,
      trends: metricTypes.map((metricType, index) => ({
        metricType,
        points: all[index]
          .map((snapshot) => ({
            timestamp: snapshot.timestamp.toISOString(),
            value: Number(snapshot.value)
          }))
          .reverse()
      }))
    };
  }

  async refreshSnapshotsIfStale(filters?: ScopeFilters) {
    const dimensionKey = toDimensionKey(filters);
    const latest = await this.repository.getLatestSnapshotTimestamp({
      timeBucket: MetricTimeBucket.DAY,
      dimensionKey
    });

    if (latest && Date.now() - latest.getTime() < 15 * 60 * 1000) {
      return;
    }

    await Promise.all([
      this.calculatePeriodMetrics("DAY", filters, true),
      this.calculatePeriodMetrics("WEEK", filters, true),
      this.calculatePeriodMetrics("MONTH", filters, true)
    ]);
  }

  async calculatePeriodMetrics(
    bucket: "DAY" | "WEEK" | "MONTH",
    filters?: ScopeFilters,
    persistSnapshot = false
  ): Promise<PeriodMetrics> {
    const window = getPeriodWindow(bucket, new Date());

    const [
      totalIngestions,
      highConfidenceCount,
      mediumConfidenceCount,
      lowConfidenceCount,
      correctedCount,
      rejectedCount,
      duplicateCount,
      totalPredictions,
      predictionConfirmedCount,
      predictionDismissedCount,
      predictionPromotedCount,
      predictionConfidenceAverages,
      autoFlowCreatedCount,
      autoFlowTriggeredCount,
      autoFlowAcceptedCount,
      autoFlowDismissedCount,
      autoFlowAcceptedDurations,
      guidedStartedCount,
      guidedCompletedCount,
      guidedAbandonedCount,
      guidedSessionCount,
      guidedCompletedStepCount,
      guidedStepEvents,
      correctionsCount,
      reviewQueueSize,
      approvalQueueSize,
      approvalApprovedCount,
      approvalRejectedCount,
      reassignmentFrequency,
      householdAssignmentStats,
      autonomyStats,
      flowSessionCount,
      focusSessionCount,
      llmUsageSummary,
      gmailClassifiedCount
    ] = await Promise.all([
      this.repository.countImportSources({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countImportSources({
        start: window.start,
        end: window.end,
        minConfidence: 0.78,
        filters
      }),
      this.repository.countImportSources({
        start: window.start,
        end: window.end,
        minConfidence: 0.48,
        maxConfidence: 0.78,
        filters
      }),
      this.repository.countImportSources({
        start: window.start,
        end: window.end,
        maxConfidence: 0.48,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "ingestion_corrected",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "ingestion_rejected",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countAuditEvents({
        eventTypes: ["ingestion_duplicate_detected", "ingestion_structured_duplicate_detected"],
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countPredictionsCreated({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "prediction_confirmed",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "prediction_dismissed",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "prediction_promoted",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.getPredictionConfidenceAverages({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countAutoFlowCreated({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "auto_flow_triggered",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "auto_flow_accepted",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "auto_flow_dismissed",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.getAutoFlowAcceptedDurationsMs({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "guided_started",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "guided_completed",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "guided_abandoned",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countGuidedJourneys({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countGuidedCompletedSteps({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.listGuidedStepCompletedEvents({
        start: window.start,
        end: window.end,
        filters,
        limit: 5000
      }),
      this.repository.countObservabilityEvents({
        eventType: "correction_applied",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countReviewQueue(filters),
      this.repository.countApprovalQueue(filters),
      this.repository.countObservabilityEvents({
        eventType: "approval_approved",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "approval_rejected",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "item_reassigned",
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.getHouseholdAssignmentStats(filters),
      this.repository.getAutonomyStats({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countFlowSessions({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countFocusSessions({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.getLlmUsageSummary({
        start: window.start,
        end: window.end,
        filters
      }),
      this.repository.countObservabilityEvents({
        eventType: "gmail_message_classified_v2",
        start: window.start,
        end: window.end,
        filters
      })
    ]);

    const predictionOutcomesTotal =
      predictionConfirmedCount + predictionDismissedCount + predictionPromotedCount;

    const autoFlowIgnoredCount = Math.max(
      0,
      autoFlowTriggeredCount - autoFlowAcceptedCount - autoFlowDismissedCount
    );

    const confidenceCorrelation = clamp01(
      (predictionConfidenceAverages.positiveAvg - predictionConfidenceAverages.negativeAvg + 1) / 2
    );

    const sessionCount = flowSessionCount + focusSessionCount + guidedSessionCount;
    const correctionRate = safePct(correctionsCount, Math.max(totalIngestions, 1));

    const assignmentMismatchRate = safePct(
      householdAssignmentStats.mismatch,
      Math.max(householdAssignmentStats.assigned, 1)
    );
    const unclaimedItemsRate = safePct(
      householdAssignmentStats.unclaimed,
      Math.max(householdAssignmentStats.total, 1)
    );

    const autonomySuccessRate = safePct(
      Math.max(0, autonomyStats.executed - autonomyStats.undone),
      Math.max(autonomyStats.executed, 1)
    );

    const guidedDropOffRate = safePct(guidedAbandonedCount, Math.max(guidedStartedCount, 1));

    const stepDropOff = this.toStepDropOff(guidedStepEvents, guidedStartedCount);

    const ingestionQualityScore = clampScore(
      safePct(highConfidenceCount, Math.max(totalIngestions, 1)) * 0.45 +
        (100 - safePct(correctedCount, Math.max(totalIngestions, 1))) * 0.2 +
        (100 - safePct(rejectedCount, Math.max(totalIngestions, 1))) * 0.2 +
        (100 - safePct(duplicateCount, Math.max(totalIngestions, 1))) * 0.15
    );

    const predictionAccuracyScore = clampScore(
      safePct(predictionConfirmedCount, Math.max(predictionOutcomesTotal, 1)) * 0.45 +
        safePct(predictionPromotedCount, Math.max(predictionOutcomesTotal, 1)) * 0.2 +
        (100 - safePct(predictionDismissedCount, Math.max(predictionOutcomesTotal, 1))) * 0.2 +
        confidenceCorrelation * 100 * 0.15
    );

    const automationEffectivenessScore = clampScore(
      safePct(autoFlowAcceptedCount, Math.max(autoFlowTriggeredCount, 1)) * 0.5 +
        (100 - safePct(autoFlowDismissedCount, Math.max(autoFlowTriggeredCount, 1))) * 0.3 +
        autonomySuccessRate * 0.2
    );

    const queueHealthScore = clampScore(100 - reviewQueueSize * 1.8 - approvalQueueSize * 2.6);
    const assignmentBalance = clampScore(100 - unclaimedItemsRate * 0.6 - assignmentMismatchRate * 0.4);
    const trustScore = clampScore(
      (100 - correctionRate) * 0.3 +
        (100 - safePct(approvalRejectedCount, Math.max(approvalApprovedCount + approvalRejectedCount, 1))) *
          0.25 +
        queueHealthScore * 0.25 +
        assignmentBalance * 0.2
    );

    const llmTotalRequests = llmUsageSummary.totalRequests;
    const llmExecutedCalls = llmUsageSummary.completedCount + llmUsageSummary.failedCount;
    const llmCacheHitRate = safePct(llmUsageSummary.cacheHitCount, Math.max(llmTotalRequests, 1));
    const llmGateSkipRate = safePct(llmUsageSummary.gateSkippedCount, Math.max(llmTotalRequests, 1));
    const llmFailureRate = safePct(llmUsageSummary.failedCount, Math.max(llmExecutedCalls, 1));
    const llmResolvedWithoutProviderRate = safePct(
      llmUsageSummary.cacheHitCount + llmUsageSummary.gateSkippedCount,
      Math.max(llmTotalRequests, 1)
    );
    const lowCostTierRate = safePct(
      llmUsageSummary.tierCounts.TIER_LOW_COST,
      Math.max(llmTotalRequests, 1)
    );
    const reasoningTierRate = safePct(
      llmUsageSummary.tierCounts.TIER_REASONING,
      Math.max(llmTotalRequests, 1)
    );
    const premiumTierRate = safePct(
      llmUsageSummary.tierCounts.TIER_PREMIUM,
      Math.max(llmTotalRequests, 1)
    );
    const gmailFallbackRate = safePct(llmUsageSummary.gmailTaskCount, Math.max(gmailClassifiedCount, 1));

    const periodMetrics: PeriodMetrics = {
      bucket,
      window: {
        start: window.start.toISOString(),
        end: window.end.toISOString()
      },
      systemHealth: {
        ingestionVolume: totalIngestions,
        predictionVolume: totalPredictions,
        autoFlowVolume: autoFlowCreatedCount
      },
      ingestionQuality: {
        totalIngestions,
        highConfidenceRate: safePct(highConfidenceCount, Math.max(totalIngestions, 1)),
        mediumConfidenceRate: safePct(mediumConfidenceCount, Math.max(totalIngestions, 1)),
        lowConfidenceRate: safePct(lowConfidenceCount, Math.max(totalIngestions, 1)),
        correctedRate: safePct(correctedCount, Math.max(totalIngestions, 1)),
        rejectedRate: safePct(rejectedCount, Math.max(totalIngestions, 1)),
        duplicateRate: safePct(duplicateCount, Math.max(totalIngestions, 1))
      },
      predictionAccuracy: {
        confirmedRate: safePct(predictionConfirmedCount, Math.max(predictionOutcomesTotal, 1)),
        dismissedRate: safePct(predictionDismissedCount, Math.max(predictionOutcomesTotal, 1)),
        promotedRate: safePct(predictionPromotedCount, Math.max(predictionOutcomesTotal, 1)),
        confidenceOutcomeCorrelation: round(confidenceCorrelation * 100, 2)
      },
      automationPerformance: {
        acceptedRate: safePct(autoFlowAcceptedCount, Math.max(autoFlowTriggeredCount, 1)),
        dismissedRate: safePct(autoFlowDismissedCount, Math.max(autoFlowTriggeredCount, 1)),
        ignoredRate: safePct(autoFlowIgnoredCount, Math.max(autoFlowTriggeredCount, 1)),
        avgTimeToActionMinutes: round(avg(autoFlowAcceptedDurations) / 60000, 2),
        autonomySuccessRate: round(autonomySuccessRate, 2)
      },
      executionLayer: {
        guidedCompletionRate: safePct(guidedCompletedCount, Math.max(guidedStartedCount, 1)),
        guidedDropOffRate,
        avgStepsPerSession: round(
          safeDiv(guidedCompletedStepCount, Math.max(guidedSessionCount, 1)),
          2
        ),
        stepDropOff
      },
      trustAndCorrection: {
        correctionsPerSession: round(safeDiv(correctionsCount, Math.max(sessionCount, 1)), 2),
        reviewQueueSize,
        approvalQueueSize,
        rejectionRate: safePct(
          approvalRejectedCount,
          Math.max(approvalApprovedCount + approvalRejectedCount, 1)
        ),
        correctionRate: round(correctionRate, 2)
      },
      householdMetrics: {
        collaborationEfficiency: clampScore(
          100 - assignmentMismatchRate * 0.55 - unclaimedItemsRate * 0.45
        ),
        assignmentBalance,
        assignmentMismatchRate,
        reassignmentFrequency: reassignmentFrequency,
        unclaimedItemsRate
      },
      autonomySafety: {
        totalAutoActions: autonomyStats.executed,
        undoneRate: safePct(autonomyStats.undone, Math.max(autonomyStats.executed, 1)),
        overriddenRate: safePct(autonomyStats.overridden, Math.max(autonomyStats.total, 1)),
        requiringApprovalRate: safePct(
          autonomyStats.requiringApproval,
          Math.max(autonomyStats.total, 1)
        )
      },
      llmOptimization: {
        totalRequests: llmTotalRequests,
        executedCalls: llmExecutedCalls,
        cacheHitRate: llmCacheHitRate,
        gateSkipRate: llmGateSkipRate,
        failureRate: llmFailureRate,
        avgLatencyMs: round(llmUsageSummary.avgLatencyMs, 2),
        estimatedCostUsd: round(llmUsageSummary.estimatedCostUsd, 4),
        asyncEnqueued: llmUsageSummary.asyncEnqueuedCount,
        resolvedWithoutProviderRate: llmResolvedWithoutProviderRate,
        lowCostTierRate,
        reasoningTierRate,
        premiumTierRate,
        gmailFallbackRate
      },
      qualityScores: {
        ingestionQualityScore,
        predictionAccuracyScore,
        automationEffectivenessScore,
        trustScore
      }
    };

    if (persistSnapshot) {
      await this.persistSnapshots(periodMetrics, filters, window.bucketStart);
    }

    return periodMetrics;
  }

  private toStepDropOff(
    stepEvents: Array<{ metadata: Prisma.JsonValue | null }>,
    startedCount: number
  ) {
    const counts = new Map<string, number>();

    for (const row of stepEvents) {
      const metadata = asRecord(row.metadata);
      const stepKey = asString(metadata?.stepKey);
      if (!stepKey) continue;
      counts.set(stepKey, (counts.get(stepKey) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([stepKey, completedCount]) => ({
        stepKey,
        completedCount,
        completionRate: safePct(completedCount, Math.max(startedCount, 1))
      }))
      .sort((left, right) => right.completedCount - left.completedCount)
      .slice(0, 12);
  }

  private async persistSnapshots(metrics: PeriodMetrics, filters: ScopeFilters | undefined, timestamp: Date) {
    const dimension = {
      userId: filters?.userId ?? null,
      householdId: filters?.householdId ?? null
    } as Prisma.InputJsonObject;
    const dimensionKey = toDimensionKey(filters);

    const values = flattenMetricValues(metrics);

    await Promise.all(
      Object.entries(values).map(([metricType, value]) =>
        this.repository.upsertSnapshot({
          metricType,
          value,
          dimension,
          dimensionKey,
          timeBucket: toMetricTimeBucket(metrics.bucket),
          timestamp
        })
      )
    );
  }
}

const DEFAULT_TREND_METRICS = [
  "ingestion.low_confidence_rate",
  "prediction.confirmed_rate",
  "auto_flow.dismissed_rate",
  "llm.cache_hit_rate",
  "llm.cost_usd",
  "scores.trust"
];

function flattenMetricValues(metrics: PeriodMetrics) {
  return {
    "ingestion.total": metrics.ingestionQuality.totalIngestions,
    "ingestion.high_confidence_rate": metrics.ingestionQuality.highConfidenceRate,
    "ingestion.medium_confidence_rate": metrics.ingestionQuality.mediumConfidenceRate,
    "ingestion.low_confidence_rate": metrics.ingestionQuality.lowConfidenceRate,
    "ingestion.corrected_rate": metrics.ingestionQuality.correctedRate,
    "ingestion.rejected_rate": metrics.ingestionQuality.rejectedRate,
    "ingestion.duplicate_rate": metrics.ingestionQuality.duplicateRate,

    "prediction.confirmed_rate": metrics.predictionAccuracy.confirmedRate,
    "prediction.dismissed_rate": metrics.predictionAccuracy.dismissedRate,
    "prediction.promoted_rate": metrics.predictionAccuracy.promotedRate,
    "prediction.confidence_outcome_correlation":
      metrics.predictionAccuracy.confidenceOutcomeCorrelation,

    "auto_flow.accepted_rate": metrics.automationPerformance.acceptedRate,
    "auto_flow.dismissed_rate": metrics.automationPerformance.dismissedRate,
    "auto_flow.ignored_rate": metrics.automationPerformance.ignoredRate,
    "auto_flow.avg_time_to_action_minutes": metrics.automationPerformance.avgTimeToActionMinutes,

    "guided.completion_rate": metrics.executionLayer.guidedCompletionRate,
    "guided.dropoff_rate": metrics.executionLayer.guidedDropOffRate,
    "guided.avg_steps_per_session": metrics.executionLayer.avgStepsPerSession,

    "trust.corrections_per_session": metrics.trustAndCorrection.correctionsPerSession,
    "trust.review_queue_size": metrics.trustAndCorrection.reviewQueueSize,
    "trust.approval_queue_size": metrics.trustAndCorrection.approvalQueueSize,
    "trust.rejection_rate": metrics.trustAndCorrection.rejectionRate,
    "trust.correction_rate": metrics.trustAndCorrection.correctionRate,

    "household.assignment_mismatch_rate": metrics.householdMetrics.assignmentMismatchRate,
    "household.reassignment_frequency": metrics.householdMetrics.reassignmentFrequency,
    "household.unclaimed_rate": metrics.householdMetrics.unclaimedItemsRate,
    "household.collaboration_efficiency": metrics.householdMetrics.collaborationEfficiency,
    "household.assignment_balance": metrics.householdMetrics.assignmentBalance,

    "autonomy.total_auto_actions": metrics.autonomySafety.totalAutoActions,
    "autonomy.undone_rate": metrics.autonomySafety.undoneRate,
    "autonomy.overridden_rate": metrics.autonomySafety.overriddenRate,
    "autonomy.requiring_approval_rate": metrics.autonomySafety.requiringApprovalRate,

    "llm.total_requests": metrics.llmOptimization.totalRequests,
    "llm.executed_calls": metrics.llmOptimization.executedCalls,
    "llm.cache_hit_rate": metrics.llmOptimization.cacheHitRate,
    "llm.gate_skip_rate": metrics.llmOptimization.gateSkipRate,
    "llm.failure_rate": metrics.llmOptimization.failureRate,
    "llm.avg_latency_ms": metrics.llmOptimization.avgLatencyMs,
    "llm.cost_usd": metrics.llmOptimization.estimatedCostUsd,
    "llm.async_enqueued": metrics.llmOptimization.asyncEnqueued,
    "llm.resolved_without_provider_rate": metrics.llmOptimization.resolvedWithoutProviderRate,
    "llm.low_cost_tier_rate": metrics.llmOptimization.lowCostTierRate,
    "llm.reasoning_tier_rate": metrics.llmOptimization.reasoningTierRate,
    "llm.premium_tier_rate": metrics.llmOptimization.premiumTierRate,
    "llm.gmail_fallback_rate": metrics.llmOptimization.gmailFallbackRate,

    "scores.ingestion_quality": metrics.qualityScores.ingestionQualityScore,
    "scores.prediction_accuracy": metrics.qualityScores.predictionAccuracyScore,
    "scores.automation_effectiveness": metrics.qualityScores.automationEffectivenessScore,
    "scores.trust": metrics.qualityScores.trustScore
  };
}

function getPeriodWindow(bucket: "DAY" | "WEEK" | "MONTH", now: Date): PeriodWindow {
  const utcNow = new Date(now.toISOString());

  if (bucket === "DAY") {
    const start = new Date(
      Date.UTC(
        utcNow.getUTCFullYear(),
        utcNow.getUTCMonth(),
        utcNow.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    return {
      start,
      end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
      bucketStart: start
    };
  }

  if (bucket === "WEEK") {
    const day = utcNow.getUTCDay();
    const offset = (day + 6) % 7;
    const start = new Date(
      Date.UTC(
        utcNow.getUTCFullYear(),
        utcNow.getUTCMonth(),
        utcNow.getUTCDate() - offset,
        0,
        0,
        0,
        0
      )
    );
    return {
      start,
      end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
      bucketStart: start
    };
  }

  const start = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), 1, 0, 0, 0, 0));
  return {
    start,
    end: new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth() + 1, 1, 0, 0, 0, 0)),
    bucketStart: start
  };
}

function toDimensionKey(filters?: ScopeFilters) {
  const userId = filters?.userId ?? "all";
  const householdId = filters?.householdId ?? "all";
  return `user:${userId}|household:${householdId}`;
}

function toMetricTimeBucket(bucket: "DAY" | "WEEK" | "MONTH") {
  if (bucket === "DAY") return MetricTimeBucket.DAY;
  if (bucket === "WEEK") return MetricTimeBucket.WEEK;
  return MetricTimeBucket.MONTH;
}

function safeDiv(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function safePct(numerator: number, denominator: number) {
  return round(safeDiv(numerator, denominator) * 100, 2);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampScore(value: number) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return round(value, 2);
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}
