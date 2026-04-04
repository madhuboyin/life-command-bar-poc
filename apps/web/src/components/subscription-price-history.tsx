import type { SubscriptionPriceHistoryItem } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

export default function SubscriptionPriceHistory({
  items
}: {
  items: SubscriptionPriceHistoryItem[];
}) {
  if (items.length === 0) {
    return (
      <div style={{ ...cardStyles.bordered, color: colors.textMuted, fontSize: 13 }}>
        No price history yet.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item) => (
        <div key={item.id} style={{ ...cardStyles.bordered, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {item.priceType.toLowerCase()} · {item.currency} {item.amount.toFixed(2)}
          </div>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            {item.billingPeriod ? item.billingPeriod.toLowerCase() : "no cadence"} · Effective{" "}
            {formatDate(item.effectiveDate ?? item.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}
