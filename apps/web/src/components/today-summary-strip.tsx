"use client";

import type { DailyCommandCenterResponse } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

export default function TodaySummaryStrip({
  summary,
  pulse
}: {
  summary: DailyCommandCenterResponse["summary"];
  pulse: DailyCommandCenterResponse["pulse"];
}) {
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>Today Summary</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {summary.todayCount === 0 ? "Done for now" : `${summary.todayCount} to handle`}
          </div>
        </div>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>
          Pulse {pulse.openedToday ? "opened" : "not opened"} · {pulse.completedCount} completed
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <Metric label="Urgent" value={summary.urgentCount} />
        <Metric label="Quick look" value={summary.reviewCount} />
        <Metric label="Upcoming" value={summary.upcomingCount} />
        <Metric label="Completed" value={summary.completedTodayCount} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 10,
        background: colors.surfaceMuted
      }}
    >
      <div style={{ fontSize: 12, color: colors.textMuted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
