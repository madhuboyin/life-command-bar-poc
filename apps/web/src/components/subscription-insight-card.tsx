import type { SubscriptionOptimizationInsight } from "../lib/types";
import { cardStyles, colors, radius } from "../lib/ui";

export default function SubscriptionInsightCard({
  insight
}: {
  insight: SubscriptionOptimizationInsight;
}) {
  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>{insight.title}</strong>
        <span
          style={{
            borderRadius: radius.pill,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            background:
              insight.severity === "HIGH"
                ? colors.dangerBg
                : insight.severity === "MEDIUM"
                  ? colors.quickWinBg
                  : colors.neutralBadgeBg,
            color:
              insight.severity === "HIGH"
                ? colors.dangerText
                : insight.severity === "MEDIUM"
                  ? colors.quickWinText
                  : colors.neutralBadgeText
          }}
        >
          {insight.severity.toLowerCase()}
        </span>
      </div>

      <div style={{ color: colors.textMuted, fontSize: 14 }}>{insight.description}</div>
      <div style={{ color: colors.textMuted, fontSize: 13 }}>
        Confidence {Math.round(insight.confidence * 100)}%
      </div>
      <div style={{ fontSize: 13 }}>{insight.recommendedAction}</div>
    </article>
  );
}

