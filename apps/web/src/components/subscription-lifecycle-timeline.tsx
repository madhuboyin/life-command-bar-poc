import type { SubscriptionDecisionFlowData } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

export default function SubscriptionLifecycleTimeline({
  items
}: {
  items: SubscriptionDecisionFlowData["detailSections"]["lifecycleTimeline"];
}) {
  if (items.length === 0) {
    return (
      <section style={{ ...cardStyles.section, color: colors.textMuted }}>
        No status updates yet.
      </section>
    );
  }

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0 }}>Status timeline</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <article key={item.id} style={{ ...cardStyles.item, display: "grid", gap: 4 }}>
            <strong>{item.eventType.toLowerCase().replace(/_/g, " ")}</strong>
            <div style={{ color: colors.textMuted, fontSize: 13 }}>
              {item.previousState ? item.previousState.toLowerCase() : "unknown"} →{" "}
              {item.nextState ? item.nextState.toLowerCase() : "unknown"}
            </div>
            <div style={{ color: colors.textMuted, fontSize: 12 }}>{item.eventDate.slice(0, 10)}</div>
            {item.note ? <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.note}</div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
