import type { SubscriptionReviewHubSummary } from "../lib/types";
import { cardStyles, colors, radius } from "../lib/ui";

export default function SubscriptionReviewSummary({
  summary
}: {
  summary: SubscriptionReviewHubSummary;
}) {
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12, color: colors.textMuted, textTransform: "uppercase", fontWeight: 700 }}>
        Subscription Review Queue
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <SummaryPill label={`Need review ${summary.totalReviewItems}`} />
        <SummaryPill label={`Renewing soon ${summary.renewingSoonCount}`} />
        <SummaryPill label={`Price increased ${summary.priceIncreasedCount}`} />
        <SummaryPill label={`Needs confirmation ${summary.needsConfirmationCount}`} />
        <SummaryPill
          label={`Potential savings ${formatMoney(summary.potentialSavingsAmount, summary.currency)}`}
        />
      </div>
    </section>
  );
}

function SummaryPill({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: radius.pill,
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 700,
        background: colors.neutralBadgeBg,
        color: colors.neutralBadgeText
      }}
    >
      {label}
    </span>
  );
}

function formatMoney(amount: number, currency: string | null) {
  return `${(currency ?? "USD").toUpperCase()} ${amount.toFixed(2)}`;
}
