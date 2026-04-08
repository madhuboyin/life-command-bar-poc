"use client";

import type { DailyCommandCenterCompletedItem } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";
import { buildCompletionReliefMessage } from "../lib/emotional-trust.service";

export default function TodayCompletedCollapsed({
  items
}: {
  items: DailyCommandCenterCompletedItem[];
}) {
  const relief = buildCompletionReliefMessage({
    remainingCount: items.length === 0 ? 0 : 1
  });
  return (
    <section style={{ ...cardStyles.section }}>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>
          Done / Safe Today ({items.length})
        </summary>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {items.length === 0 ? (
            <div style={{ color: colors.textMuted }}>{relief.supporting}</div>
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
