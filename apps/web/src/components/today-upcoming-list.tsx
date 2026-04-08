"use client";

import Link from "next/link";
import type { DailyCommandCenterItem } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

export default function TodayUpcomingList({ items }: { items: DailyCommandCenterItem[] }) {
  if (items.length === 0) {
    return (
      <section style={{ ...cardStyles.section }}>
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>Upcoming This Week</div>
        <div style={{ color: colors.textMuted }}>No medium-priority items queued for this week.</div>
      </section>
    );
  }

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, color: colors.textMuted }}>Upcoming This Week</div>
      {items.map((item) => (
        <article
          key={item.id}
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 12,
            background: colors.surfaceMuted,
            display: "grid",
            gap: 4
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{item.title}</strong>
            <span style={{ fontSize: 12, color: colors.textMuted }}>{item.priorityBand.toLowerCase()}</span>
          </div>
          {item.subtitle ? <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.subtitle}</div> : null}
          <div style={{ fontSize: 13, color: colors.textMuted }}>{item.whyNow}</div>
          {item.primaryAction.mode === "NAVIGATE" && item.primaryAction.href ? (
            <div>
              <Link href={item.primaryAction.href} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                {item.primaryAction.label}
              </Link>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
