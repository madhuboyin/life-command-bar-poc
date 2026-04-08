import type { SubscriptionDecisionFlowData } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

export default function SubscriptionEvidenceSummary({
  items
}: {
  items: SubscriptionDecisionFlowData["detailSections"]["evidenceSummary"];
}) {
  if (items.length === 0) {
    return (
      <section style={{ ...cardStyles.section, color: colors.textMuted }}>
        No evidence summary is available yet.
      </section>
    );
  }

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0 }}>Evidence summary</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <article key={item.id} style={{ ...cardStyles.item, display: "grid", gap: 4 }}>
            <strong>
              {item.sourceSubType
                ? item.sourceSubType.toLowerCase().replace(/_/g, " ")
                : item.sourceType.toLowerCase()}
            </strong>
            <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.summaryLine}</div>
            <div style={{ color: colors.textMuted, fontSize: 12 }}>
              Confidence {Math.round(item.confidenceScore * 100)}% · {item.observedAt.slice(0, 10)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
