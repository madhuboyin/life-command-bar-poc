import Link from "next/link";
import type { SubscriptionRegistrySummary } from "../lib/types";
import { cardStyles, colors, radius } from "../lib/ui";
import {
  buildRecommendationMessage,
  buildSummaryMessage
} from "../lib/human-language.service";
import SubscriptionLifecycleBadge from "./subscription-lifecycle-badge";
import SubscriptionHealthBadge from "./subscription-health-badge";

export default function SubscriptionRegistryCard({
  subscription
}: {
  subscription: SubscriptionRegistrySummary;
}) {
  const summary = buildSummaryMessage({
    confidence: subscription.sourceConfidenceBand
  });
  const recommendation = subscription.optimization
    ? buildRecommendationMessage({
        recommendationType: subscription.optimization.recommendation.recommendationType,
        reason: subscription.optimization.recommendation.reason
      })
    : null;

  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0" }}>{subscription.subscriptionTitle}</h3>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            {subscription.vendorName}
            {subscription.planName ? ` · ${subscription.planName}` : ""}
          </div>
        </div>
        <SubscriptionLifecycleBadge state={subscription.lifecycleState} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tag label={summary.primary} />
        <Tag label={`Billing ${subscription.billingPeriod.toLowerCase()}`} />
        {subscription.optimization ? (
          <SubscriptionHealthBadge health={subscription.optimization.health} />
        ) : null}
        {recommendation ? <Tag label={recommendation.primary} /> : null}
        {subscription.recurringPrice !== null ? (
          <Tag label={`Recurring ${formatMoney(subscription.recurringPrice, subscription.currency)}`} />
        ) : null}
        {subscription.nextRenewalDate ? <Tag label={`Renews ${formatDate(subscription.nextRenewalDate)}`} /> : null}
      </div>

      <div style={{ fontSize: 13, color: colors.textMuted }}>
        Details tracked: {subscription.counts.evidence} updates · {subscription.counts.linkedObligations} linked items
      </div>

      <div>
        <Link href={`/subscriptions/${subscription.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
          Open subscription →
        </Link>
      </div>
    </article>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: radius.pill,
        border: `1px solid ${colors.border}`,
        background: colors.surface,
        color: colors.textMuted,
        fontSize: 12,
        padding: "4px 10px"
      }}
    >
      {label}
    </span>
  );
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

function formatMoney(amount: number, currency: string | null) {
  if (!currency) return amount.toFixed(2);
  return `${currency} ${amount.toFixed(2)}`;
}
