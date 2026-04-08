import Link from "next/link";
import {
  getAdminAlerts,
  getAdminEvents,
  getAdminMetrics,
  getAdminMetricTrends
} from "../../../lib/api";
import MetricTable from "../../../components/metric-table";
import MetricsCard from "../../../components/metrics-card";
import QualityScoreCard from "../../../components/quality-score-card";
import TimeSeriesChart from "../../../components/time-series-chart";
import { cardStyles, colors, pageStyles } from "../../../lib/ui";

export default async function AdminObservabilityPage() {
  let metrics = null;
  let alerts = null;
  let trends = null;
  let events = null;
  let error: string | null = null;

  try {
    [metrics, alerts, trends, events] = await Promise.all([
      getAdminMetrics(),
      getAdminAlerts(),
      getAdminMetricTrends({
        metricTypes: [
          "ingestion.low_confidence_rate",
          "prediction.confirmed_rate",
          "auto_flow.dismissed_rate",
          "llm.cache_hit_rate",
          "llm.cost_usd",
          "scores.trust"
        ],
        timeBucket: "DAY",
        limit: 14
      }),
      getAdminEvents({ limit: 12 })
    ]);
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load admin observability data.";
  }

  const day = metrics?.periods.day;

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>

      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15 }}>Admin Observability</h1>
        <p style={{ marginTop: 8, color: colors.textMuted }}>
          Internal intelligence quality, automation performance, and end-to-end traceability.
        </p>
        {error ? (
          <p style={{ color: colors.errorText, marginTop: 8 }}>{error}</p>
        ) : (
          <p style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
            Last refreshed: {metrics?.generatedAt ? formatDateTime(metrics.generatedAt) : "-"}
          </p>
        )}
      </header>

      {day ? (
        <>
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
              marginBottom: 16
            }}
          >
            <QualityScoreCard
              title="Ingestion Quality Score"
              score={day.qualityScores.ingestionQualityScore}
            />
            <QualityScoreCard
              title="Prediction Accuracy Score"
              score={day.qualityScores.predictionAccuracyScore}
            />
            <QualityScoreCard
              title="Automation Effectiveness"
              score={day.qualityScores.automationEffectivenessScore}
            />
            <QualityScoreCard title="Trust Score" score={day.qualityScores.trustScore} />
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginBottom: 18
            }}
          >
            <MetricsCard
              title="Ingestion Volume"
              value={day.systemHealth.ingestionVolume}
              subtitle="System Health"
            />
            <MetricsCard
              title="Prediction Volume"
              value={day.systemHealth.predictionVolume}
              subtitle="System Health"
            />
            <MetricsCard
              title="Auto-Flow Volume"
              value={day.systemHealth.autoFlowVolume}
              subtitle="System Health"
            />
            <MetricsCard
              title="Review Queue"
              value={day.trustAndCorrection.reviewQueueSize}
              subtitle="Trust & Correction"
            />
            <MetricsCard
              title="Approval Queue"
              value={day.trustAndCorrection.approvalQueueSize}
              subtitle="Trust & Correction"
            />
            <MetricsCard
              title="Guided Completion"
              value={toPct(day.executionLayer.guidedCompletionRate)}
              subtitle="Execution Layer"
            />
            <MetricsCard
              title="LLM Requests"
              value={day.llmOptimization.totalRequests}
              subtitle="LLM Optimization"
            />
            <MetricsCard
              title="LLM Cache Hit Rate"
              value={toPct(day.llmOptimization.cacheHitRate)}
              subtitle="LLM Optimization"
            />
            <MetricsCard
              title="LLM Gate Skip Rate"
              value={toPct(day.llmOptimization.gateSkipRate)}
              subtitle="LLM Optimization"
            />
            <MetricsCard
              title="LLM Estimated Cost (Day)"
              value={`$${formatNumber(day.llmOptimization.estimatedCostUsd)}`}
              subtitle="LLM Optimization"
            />
            <MetricsCard
              title="Adaptive Today Applied"
              value={toPct(day.adaptivePersonalization.todayAppliedRate)}
              subtitle="Adaptive Personalization"
            />
            <MetricsCard
              title="Adaptive Fallback Rate"
              value={toPct(day.adaptivePersonalization.fallbackRate)}
              subtitle="Adaptive Personalization"
            />
            <MetricsCard
              title="Behavior Profile Coverage"
              value={toPct(day.adaptivePersonalization.profileCoverageRate)}
              subtitle="Adaptive Personalization"
            />
            <MetricsCard
              title="Adaptive Error Recovery"
              value={toPct(day.adaptivePersonalization.errorRecoveryRate)}
              subtitle="Adaptive Personalization"
            />
          </section>

          <section style={{ ...cardStyles.section, marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>Core Trends (14 days)</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 12
              }}
            >
              {trends?.trends.map((trend) => (
                <div key={trend.metricType}>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>
                    {humanizeMetricType(trend.metricType)}
                  </div>
                  <TimeSeriesChart points={trend.points} unit={isRateMetric(trend.metricType) ? "%" : ""} />
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...cardStyles.section, marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>Alerting</h2>
            <MetricTable
              columns={[
                { key: "severity", label: "Severity" },
                { key: "title", label: "Alert" },
                { key: "metricType", label: "Metric" },
                { key: "current", label: "Current", align: "right" },
                { key: "threshold", label: "Threshold", align: "right" }
              ]}
              rows={(alerts?.alerts ?? []).map((alert) => ({
                id: alert.id,
                severity: alert.severity,
                title: alert.title,
                metricType: humanizeMetricType(alert.metricType),
                current: formatNumber(alert.currentValue),
                threshold: formatNumber(alert.threshold)
              }))}
              emptyMessage="No active alerts."
            />
          </section>

          <section style={{ ...cardStyles.section, marginBottom: 16 }}>
            <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>Recent Events (Traceability)</h2>
            <MetricTable
              columns={[
                { key: "time", label: "Time" },
                { key: "eventType", label: "Event Type" },
                { key: "entity", label: "Entity" },
                { key: "traceId", label: "Trace" },
                { key: "correlationId", label: "Correlation" }
              ]}
              rows={(events?.items ?? []).map((event) => ({
                id: event.id,
                time: formatDateTime(event.timestamp),
                eventType: event.eventType,
                entity: event.entityType && event.entityId ? `${event.entityType}:${event.entityId}` : "-",
                traceId: event.traceId ?? "-",
                correlationId: event.correlationId ?? "-"
              }))}
              emptyMessage="No observability events yet."
            />
          </section>

          <section style={cardStyles.section}>
            <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>Execution + Trust Diagnostics</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <MetricsCard
                title="Corrections per Session"
                value={formatNumber(day.trustAndCorrection.correctionsPerSession)}
              />
              <MetricsCard
                title="Rejection Rate"
                value={toPct(day.trustAndCorrection.rejectionRate)}
              />
              <MetricsCard
                title="Auto-Flow Acceptance"
                value={toPct(day.automationPerformance.acceptedRate)}
              />
              <MetricsCard
                title="Autonomy Undone"
                value={toPct(day.autonomySafety.undoneRate)}
              />
              <MetricsCard
                title="Unclaimed Household Items"
                value={toPct(day.householdMetrics.unclaimedItemsRate)}
              />
              <MetricsCard
                title="Assignment Mismatch"
                value={toPct(day.householdMetrics.assignmentMismatchRate)}
              />
              <MetricsCard
                title="LLM Resolved Without Provider"
                value={toPct(day.llmOptimization.resolvedWithoutProviderRate)}
              />
              <MetricsCard
                title="Gmail LLM Fallback Rate"
                value={toPct(day.llmOptimization.gmailFallbackRate)}
              />
            </div>
          </section>
        </>
      ) : (
        <section style={cardStyles.section}>No data available yet.</section>
      )}
    </main>
  );
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

function toPct(value: number) {
  return `${formatNumber(value)}%`;
}

function formatNumber(value: number) {
  return (Math.round(value * 100) / 100).toString();
}

function humanizeMetricType(value: string) {
  return value.replace(/[_\.]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isRateMetric(metricType: string) {
  return metricType.includes("rate") || metricType.includes("score");
}
