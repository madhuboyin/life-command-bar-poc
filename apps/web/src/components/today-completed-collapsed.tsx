"use client";

import type { DailyCommandCenterCompletedItem } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

export default function TodayCompletedCollapsed({
  items
}: {
  items: DailyCommandCenterCompletedItem[];
}) {
  return (
    <section style={{ ...cardStyles.section }}>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
          Done / Safe Today ({items.length})
        </summary>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {items.length === 0 ? (
            <div style={{ color: colors.textMuted }}>No items handled yet today.</div>
          ) : (
            items.map((item) => (
              <article key={item.id} style={{ ...cardStyles.item, display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong>{item.title}</strong>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{item.status.toLowerCase()}</span>
                </div>
                <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.summary}</div>
              </article>
            ))
          )}
        </div>
      </details>
    </section>
  );
}
