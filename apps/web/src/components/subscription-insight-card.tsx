import type { SubscriptionOptimizationInsight } from "../lib/types";
import { cardStyles, colors, radius } from "../lib/ui";
import { buildRecommendationMessage } from "../lib/human-language.service";

export default function SubscriptionInsightCard({
  insight
}: {
  insight: SubscriptionOptimizationInsight;
}) {
  const message = buildRecommendationMessage({
    recommendationType: "REVIEW",
    issue: insight.insightType,
    reason: insight.description
  });

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
      <div style={{ color: colors.textMuted, fontSize: 13 }}>{message.primary}</div>
      <div style={{ fontSize: 13 }}>{insight.recommendedAction}</div>
    </article>
  );
}
