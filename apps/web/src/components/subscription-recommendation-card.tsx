import type { SubscriptionOptimizationRecommendation } from "../lib/types";
import { cardStyles, colors, radius } from "../lib/ui";

export default function SubscriptionRecommendationCard({
  recommendation
}: {
  recommendation: SubscriptionOptimizationRecommendation;
}) {
  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong>Recommendation: {recommendation.recommendationType.toLowerCase()}</strong>
        <span
          style={{
            borderRadius: radius.pill,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            background: colors.neutralBadgeBg,
            color: colors.neutralBadgeText
          }}
        >
          {Math.round(recommendation.confidence * 100)}%
        </span>
      </div>
      <div style={{ color: colors.textMuted, fontSize: 14 }}>{recommendation.reason}</div>
      {recommendation.supportingInsights.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {recommendation.supportingInsights.map((insight) => (
            <span
              key={insight}
              style={{
                borderRadius: radius.pill,
                border: `1px solid ${colors.border}`,
                padding: "3px 9px",
                fontSize: 12,
                color: colors.textMuted,
                background: colors.surface
              }}
            >
              {insight.toLowerCase().replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

