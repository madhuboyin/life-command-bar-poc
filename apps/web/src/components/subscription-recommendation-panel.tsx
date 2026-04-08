import type { SubscriptionDecisionFlowData } from "../lib/types";
import { cardStyles, colors, radius } from "../lib/ui";

export default function SubscriptionRecommendationPanel({
  recommendation,
  decisionContext
}: {
  recommendation: SubscriptionDecisionFlowData["recommendation"];
  decisionContext: SubscriptionDecisionFlowData["decisionContext"];
}) {
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 18 }}>Recommendation: {recommendation.type.toLowerCase()}</strong>
        <span
          style={{
            borderRadius: radius.pill,
            background: colors.neutralBadgeBg,
            color: colors.neutralBadgeText,
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 10px"
          }}
        >
          {Math.round(recommendation.confidence * 100)}%
        </span>
      </div>

      <div style={{ fontSize: 15 }}>{recommendation.reason}</div>
      <div style={{ color: colors.textMuted, fontSize: 14 }}>{decisionContext.whatChanged}</div>
      <div style={{ color: colors.textMuted, fontSize: 14 }}>{decisionContext.whyNow}</div>
      <div style={{ color: colors.textMuted, fontSize: 13 }}>
        Risk {decisionContext.riskLevel.toLowerCase()} · {decisionContext.sourceSummary}
      </div>

      {recommendation.supportingInsights.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {recommendation.supportingInsights.slice(0, 3).map((insight) => (
            <article key={`${insight.insightType}_${insight.title}`} style={{ ...cardStyles.item, display: "grid", gap: 4 }}>
              <strong>{insight.title}</strong>
              <div style={{ color: colors.textMuted, fontSize: 13 }}>{insight.description}</div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
