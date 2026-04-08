import type {
  SubscriptionDecisionFlowData,
  SubscriptionLifecycleState
} from "../lib/types";
import { colors } from "../lib/ui";
import { buildSummaryMessage } from "../lib/human-language.service";
import SubscriptionLifecycleBadge from "./subscription-lifecycle-badge";

export default function SubscriptionDecisionHeader({
  subscription
}: {
  subscription: SubscriptionDecisionFlowData["subscription"];
}) {
  const summary = buildSummaryMessage({
    confidence: subscription.confidenceBand,
    issue: subscription.lifecycleState === "UNKNOWN" ? "LIFECYCLE_UNKNOWN" : null
  });

  return (
    <header style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 4px 0", fontSize: 28 }}>{subscription.title}</h1>
          <div style={{ color: colors.textMuted, fontSize: 14 }}>
            {subscription.vendorName}
            {subscription.planName ? ` · ${subscription.planName}` : ""}
          </div>
        </div>
        <SubscriptionLifecycleBadge state={toLifecycleState(subscription.lifecycleState)} />
      </div>

      <div style={{ color: colors.textMuted, fontSize: 14 }}>
        {subscription.recurringPrice !== null
          ? `Current price ${formatMoney(subscription.recurringPrice, subscription.currency)}`
          : "Current price not fully confirmed"}
        {subscription.nextRenewalDate ? ` · Renews ${subscription.nextRenewalDate.slice(0, 10)}` : ""}
      </div>

      <div style={{ color: colors.textMuted, fontSize: 13 }}>
        {summary.primary}
        {summary.context ? ` · ${summary.context}` : ""}
      </div>

      <div style={{ color: colors.textMuted, fontSize: 12 }}>{subscription.whyVisible}</div>
      {subscription.lastHandledBy ? (
        <div style={{ color: colors.textMuted, fontSize: 12 }}>
          Last reviewed by {subscription.lastHandledBy.name || subscription.lastHandledBy.email}
        </div>
      ) : null}
    </header>
  );
}

function formatMoney(amount: number, currency: string | null) {
  return `${(currency ?? "USD").toUpperCase()} ${amount.toFixed(2)}`;
}

function toLifecycleState(value: string): SubscriptionLifecycleState {
  if (
    value === "DISCOVERED" ||
    value === "TRIALING" ||
    value === "ACTIVE" ||
    value === "RENEWING" ||
    value === "PRICE_CHANGED" ||
    value === "CANCELING" ||
    value === "CANCELED" ||
    value === "ENDED" ||
    value === "INACTIVE" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  return "UNKNOWN";
}
