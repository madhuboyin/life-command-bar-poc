import type { SubscriptionRegistryDetail } from "../lib/types";
import { colors } from "../lib/ui";
import SubscriptionLifecycleBadge from "./subscription-lifecycle-badge";
import SubscriptionHealthBadge from "./subscription-health-badge";

export default function SubscriptionDetailHeader({
  subscription
}: {
  subscription: SubscriptionRegistryDetail;
}) {
  return (
    <header style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{subscription.subscriptionTitle}</h1>
          <div style={{ color: colors.textMuted, marginTop: 6 }}>
            {subscription.vendorName}
            {subscription.planName ? ` · ${subscription.planName}` : ""}
          </div>
        </div>
        <SubscriptionLifecycleBadge state={subscription.lifecycleState} />
      </div>

      <div style={{ color: colors.textMuted, fontSize: 14 }}>
        Confidence {subscription.sourceConfidenceBand.toLowerCase()} ({Math.round(subscription.sourceConfidenceScore * 100)}%) ·
        Billing {subscription.billingPeriod.toLowerCase()}
      </div>
      {subscription.optimization ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <SubscriptionHealthBadge health={subscription.optimization.health} />
          <span style={{ color: colors.textMuted, fontSize: 13 }}>
            Recommendation {subscription.optimization.recommendation.recommendationType.toLowerCase()}
          </span>
        </div>
      ) : null}
    </header>
  );
}
