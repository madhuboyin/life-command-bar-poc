import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import { buildEmptyStateMessage } from "../lib/human-language.service";

export default function SubscriptionReviewEmptyState() {
  const message = buildEmptyStateMessage("subscription_review");
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0 }}>{message.primary}</h2>
      <p style={{ margin: 0, color: colors.textMuted }}>
        {message.context ?? "No subscription decisions need action right now."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/subscriptions" style={buttonStyles.link}>
          Open subscription registry
        </Link>
        <Link href="/control-tower" style={buttonStyles.link}>
          Go to control tower
        </Link>
      </div>
    </section>
  );
}
