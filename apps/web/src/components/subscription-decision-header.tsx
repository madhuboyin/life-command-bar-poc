import type {
  SubscriptionDecisionFlowData,
  SubscriptionLifecycleState
} from "../lib/types";
import { colors } from "../lib/ui";
import { buildSummaryMessage } from "../lib/human-language.service";
import {
  buildDecisionConfidenceMessage,
  buildPrimaryReassurance
} from "../lib/emotional-trust.service";
import DecisionConfidenceBadge from "./decision-confidence-badge";
import SharedContextNote from "./shared-context-note";
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
  const confidenceMessage = buildDecisionConfidenceMessage({
    confidenceBand: subscription.confidenceBand,
    actionType: "REVIEW"
  });
  const reassurance = buildPrimaryReassurance({
    confidenceBand: subscription.confidenceBand,
    actionType: "REVIEW",
    dueAt: subscription.nextRenewalDate,
    scopeType: subscription.scopeType,
    assigneeName: subscription.assignee?.name ?? subscription.assignee?.email ?? null
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <DecisionConfidenceBadge confidenceBand={subscription.confidenceBand} actionType="REVIEW" />
        <span style={{ fontSize: 13, color: colors.textMuted }}>
          {confidenceMessage.supporting ?? reassurance.supporting}
        </span>
      </div>

      <div style={{ color: colors.textMuted, fontSize: 12 }}>{subscription.whyVisible}</div>
      <SharedContextNote
        scopeType={subscription.scopeType}
        assigneeName={subscription.assignee?.name ?? subscription.assignee?.email ?? null}
        dueSoon={Boolean(subscription.nextRenewalDate)}
      />
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
