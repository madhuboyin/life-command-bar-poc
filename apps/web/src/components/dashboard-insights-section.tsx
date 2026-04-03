"use client";

import type { DashboardInsightsResponse } from "../lib/types";
import { buttonStyles } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import InsightCard from "./insight-card";
import MetricStatCard from "./metric-stat-card";
import TopInsightCard from "./top-insight-card";
import EmptyState from "./ui/empty-state";
import LoadingCard from "./ui/loading-card";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";

type Props = {
  data: DashboardInsightsResponse | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => Promise<void>;
};

export default function DashboardInsightsSection({
  data,
  loading = false,
  error = null,
  onRefresh
}: Props) {
  const isMobile = useIsMobile();

  const hasActivity =
    (data?.summary.activeNow ?? 0) > 0 ||
    (data?.summary.handledThisWeek ?? 0) > 0 ||
    (data?.summary.postponedRecently ?? 0) > 0;

  return (
    <SectionCard
      title="Dashboard Insights"
      description="Quiet signals about progress, pressure, and what to handle next."
    >
      {onRefresh ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <button
            onClick={onRefresh}
            disabled={loading}
            style={buttonStyles.secondary}
          >
            {loading ? "Refreshing..." : "Refresh insights"}
          </button>
        </div>
      ) : null}

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {loading && !data ? (
        <div style={{ display: "grid", gap: 12 }}>
          <LoadingCard title="Building insights..." lines={2} />
          <LoadingCard title="Building insights..." lines={2} />
        </div>
      ) : null}

      {!loading && !data ? (
        <EmptyState
          title="Insights are not ready yet"
          description="Once your obligations and actions build up, this area will highlight progress and next steps."
        />
      ) : null}

      {data ? (
        <div style={{ display: "grid", gap: 14 }}>
          <TopInsightCard insight={data.topInsight} />

          {!hasActivity ? (
            <EmptyState
              title="No activity yet"
              description="Add an obligation or complete one quick task to start generating useful insight cards."
            />
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: isMobile
                    ? "1fr 1fr"
                    : "repeat(4, minmax(0, 1fr))"
                }}
              >
                <MetricStatCard
                  label="Handled This Week"
                  value={data.summary.handledThisWeek}
                />
                <MetricStatCard
                  label="Active Now"
                  value={data.summary.activeNow}
                />
                <MetricStatCard
                  label="Quick Wins"
                  value={data.summary.quickWinsAvailable}
                />
                <MetricStatCard
                  label="Relief Score"
                  value={`${data.summary.reliefScore.value}`}
                  supportingText={data.summary.reliefScore.band}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: isMobile
                    ? "1fr"
                    : "repeat(3, minmax(0, 1fr))"
                }}
              >
                {data.cards.slice(0, 6).map((card) => (
                  <InsightCard key={card.key} card={card} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
