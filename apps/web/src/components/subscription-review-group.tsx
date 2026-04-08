import type { SubscriptionReviewHubGroup } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";
import SubscriptionReviewCard from "./subscription-review-card";

export default function SubscriptionReviewGroup({
  group
}: {
  group: SubscriptionReviewHubGroup;
}) {
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <header>
        <h2 style={{ margin: "0 0 4px 0", fontSize: 20 }}>{group.title}</h2>
        <p style={{ margin: 0, color: colors.textMuted }}>{group.description}</p>
      </header>

      <div style={{ display: "grid", gap: 10 }}>
        {group.items.map((item) => (
          <SubscriptionReviewCard key={item.subscriptionId} item={item} />
        ))}
      </div>
    </section>
  );
}
