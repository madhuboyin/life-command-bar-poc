import Link from "next/link";
import type {
  SubscriptionLifecycleState,
  SubscriptionReviewHubItem
} from "../lib/types";
import { buttonStyles, cardStyles, colors, radius } from "../lib/ui";
import {
  buildActionLabel,
  buildRecommendationMessage,
  buildSummaryMessage
} from "../lib/human-language.service";
import SubscriptionLifecycleBadge from "./subscription-lifecycle-badge";

export default function SubscriptionReviewCard({
  item
}: {
  item: SubscriptionReviewHubItem;
}) {
  const recommendation = buildRecommendationMessage({
    recommendationType: item.recommendationType,
    reason: item.recommendationReason
  });
  const summary = buildSummaryMessage({ confidence: item.confidenceBand });

  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", fontSize: 16 }}>{item.title}</h3>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            {item.vendorName}
            {item.planName ? ` · ${item.planName}` : ""}
          </div>
        </div>
        <SubscriptionLifecycleBadge state={toLifecycleState(item.lifecycleState)} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tag label={recommendation.primary} />
        <Tag label={summary.primary} />
        <Tag label={`Scope ${item.scopeType.toLowerCase()}`} />
        {item.recurringPrice !== null ? (
          <Tag label={`Price ${formatMoney(item.recurringPrice, item.currency)}`} />
        ) : null}
        {item.nextRenewalDate ? <Tag label={`Renews ${item.nextRenewalDate.slice(0, 10)}`} /> : null}
      </div>

      <div style={{ fontSize: 14 }}>{item.primaryInsight}</div>
      <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.recommendationReason}</div>

      {item.assignee ? (
        <div style={{ color: colors.textMuted, fontSize: 12 }}>
          Assigned to {item.assignee.name || item.assignee.email}
        </div>
      ) : item.scopeType === "HOUSEHOLD" ? (
        <div style={{ color: colors.textMuted, fontSize: 12 }}>
          Household subscription currently unassigned.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href={`/subscriptions/review/${item.subscriptionId}`} style={buttonStyles.primary}>
          {buildActionLabel("review")}
        </Link>
        <Link href={`/subscriptions/${item.subscriptionId}`} style={buttonStyles.link}>
          {buildActionLabel("details")}
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
        padding: "4px 10px",
        fontSize: 12
      }}
    >
      {label}
    </span>
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
