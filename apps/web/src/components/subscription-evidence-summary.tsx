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
        No update summary is available yet.
      </section>
    );
  }

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0 }}>Update summary</h3>
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
              {confidenceLabel(item.confidenceScore)} · {item.observedAt.slice(0, 10)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function confidenceLabel(score: number) {
  if (score >= 0.75) return "Looks clear";
  if (score >= 0.5) return "Worth a quick look";
  return "Not sure yet";
}
