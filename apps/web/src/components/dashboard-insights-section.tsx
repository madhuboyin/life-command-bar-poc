"use client";

import Link from "next/link";
import type { DashboardInsightsResponse } from "../lib/types";
import { getObligationViewHref } from "../lib/obligation-filters";
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
  const resolvedRecentlyHref = getObligationViewHref("resolved_recently", {
    flowSource: "DASHBOARD"
  });
  const activeNowHref = getObligationViewHref("active_now", {
    flowSource: "DASHBOARD"
  });
  const quickWinsHref = getObligationViewHref("quick_wins", {
    flowSource: "DASHBOARD"
  });

  const hasActivity =
    (data?.summary.activeNow ?? 0) > 0 ||
    (data?.summary.handledThisWeek ?? 0) > 0 ||
    (data?.summary.postponedRecently ?? 0) > 0;

  return (
    <SectionCard
      title="Dashboard Insights"
      description="A calm view of progress, pressure, and what to handle next."
    >
      {onRefresh ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
          <Link href="/pulse" style={buttonStyles.link}>
            Start your day
          </Link>
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
          <TopInsightCard
            insight={data.topInsight}
            href={
              data.topInsight.targetView
                ? getObligationViewHref(data.topInsight.targetView, {
                    flowSource: "DASHBOARD"
                  })
                : null
            }
          />

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
                  href={resolvedRecentlyHref}
                />
                <MetricStatCard
                  label="Active Now"
                  value={data.summary.activeNow}
                  href={activeNowHref}
                />
                <MetricStatCard
                  label="Quick Wins"
                  value={data.summary.quickWinsAvailable}
                  href={quickWinsHref}
                />
                <MetricStatCard
                  label="Relief Score"
                  value={`${data.summary.reliefScore.value}`}
                  supportingText={data.summary.reliefScore.band}
                  href={resolvedRecentlyHref}
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
                  <InsightCard
                    key={card.key}
                    card={card}
                    href={
                      card.targetView
                        ? getObligationViewHref(card.targetView, { flowSource: "DASHBOARD" })
                        : null
                    }
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
