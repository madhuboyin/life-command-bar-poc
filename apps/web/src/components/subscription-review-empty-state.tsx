import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";

export default function SubscriptionReviewEmptyState() {
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0 }}>You are clear for now</h2>
      <p style={{ margin: 0, color: colors.textMuted }}>
        No high-priority subscription decisions need action right now.
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
