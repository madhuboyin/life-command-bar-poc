import { MetricsService } from "./metrics.service";

type ScopeFilters = {
  userId?: string;
  householdId?: string;
};

type AlertSeverity = "LOW" | "MEDIUM" | "HIGH";

type AlertItem = {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  metricType: string;
  currentValue: number;
  baselineValue: number | null;
  threshold: number;
  timestamp: string;
};

export class AlertService {
  private readonly metricsService = new MetricsService();

  async getAlerts(filters?: ScopeFilters) {
    const overview = await this.metricsService.getMetricsOverview(filters);
    const day = overview.periods.day;

    const [lowConfidenceTrend, predictionScoreTrend, autoFlowDismissedTrend] = await Promise.all([
      this.metricsService.getMetricByType({
        metricType: "ingestion.low_confidence_rate",
        timeBucket: "DAY",
        limit: 21,
        userId: filters?.userId,
        householdId: filters?.householdId
      }),
      this.metricsService.getMetricByType({
        metricType: "scores.prediction_accuracy",
        timeBucket: "DAY",
        limit: 21,
        userId: filters?.userId,
        householdId: filters?.householdId
      }),
      this.metricsService.getMetricByType({
        metricType: "auto_flow.dismissed_rate",
        timeBucket: "DAY",
        limit: 21,
        userId: filters?.userId,
        householdId: filters?.householdId
      })
    ]);

    const lowConfidenceBaseline = averagePrevious(lowConfidenceTrend.points);
    const predictionBaseline = averagePrevious(predictionScoreTrend.points);
    const autoFlowDismissedBaseline = averagePrevious(autoFlowDismissedTrend.points);

    const alerts: AlertItem[] = [];

    const lowConfidenceThreshold = Math.max(35, lowConfidenceBaseline * 1.4);
    if (day.ingestionQuality.lowConfidenceRate > lowConfidenceThreshold) {
      alerts.push({
        id: "ingestion_low_confidence_spike",
        severity: "HIGH",
        title: "Low-confidence ingestion spike",
        description:
          "Low-confidence ingestions are elevated versus recent baseline. Review extraction quality and recent source changes.",
        metricType: "ingestion.low_confidence_rate",
        currentValue: day.ingestionQuality.lowConfidenceRate,
        baselineValue: round(lowConfidenceBaseline),
        threshold: round(lowConfidenceThreshold),
        timestamp: new Date().toISOString()
      });
    }

    const predictionThreshold = Math.min(60, predictionBaseline - 12);
    if (day.qualityScores.predictionAccuracyScore < predictionThreshold) {
      alerts.push({
        id: "prediction_accuracy_drop",
        severity: "HIGH",
        title: "Prediction accuracy dropped",
        description:
          "Prediction quality score is below expected range. Investigate recent dismissals and confidence calibration drift.",
        metricType: "scores.prediction_accuracy",
        currentValue: day.qualityScores.predictionAccuracyScore,
        baselineValue: round(predictionBaseline),
        threshold: round(predictionThreshold),
        timestamp: new Date().toISOString()
      });
    }

    if (day.trustAndCorrection.rejectionRate > 30) {
      alerts.push({
        id: "approval_rejection_rate_high",
        severity: "MEDIUM",
        title: "Approval rejection rate is high",
        description:
          "A high share of approval requests is being rejected, which can indicate guardrail or recommendation quality mismatch.",
        metricType: "trust.rejection_rate",
        currentValue: day.trustAndCorrection.rejectionRate,
        baselineValue: null,
        threshold: 30,
        timestamp: new Date().toISOString()
      });
    }

    const autoFlowDismissedThreshold = Math.max(35, autoFlowDismissedBaseline * 1.4);
    if (day.automationPerformance.dismissedRate > autoFlowDismissedThreshold) {
      alerts.push({
        id: "auto_flow_dismissed_spike",
        severity: "MEDIUM",
        title: "Auto-flow dismissal spike",
        description:
          "Auto-flow dismissals are significantly above baseline. Recheck trigger tuning and prioritization thresholds.",
        metricType: "auto_flow.dismissed_rate",
        currentValue: day.automationPerformance.dismissedRate,
        baselineValue: round(autoFlowDismissedBaseline),
        threshold: round(autoFlowDismissedThreshold),
        timestamp: new Date().toISOString()
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      alerts,
      summary: {
        total: alerts.length,
        high: alerts.filter((alert) => alert.severity === "HIGH").length,
        medium: alerts.filter((alert) => alert.severity === "MEDIUM").length,
        low: alerts.filter((alert) => alert.severity === "LOW").length
      }
    };
  }
}

function averagePrevious(points: Array<{ value: number }>) {
  if (points.length <= 1) return points[0]?.value ?? 0;
  const historical = points.slice(0, points.length - 1);
  if (historical.length === 0) return points[points.length - 1]?.value ?? 0;
  return historical.reduce((sum, point) => sum + point.value, 0) / historical.length;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
