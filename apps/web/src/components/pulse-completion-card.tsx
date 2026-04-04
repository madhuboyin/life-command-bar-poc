import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";

type Props = {
  onRefresh: () => void;
};

export default function PulseCompletionCard({ onRefresh }: Props) {
  return (
    <section
      style={{
        ...cardStyles.section,
        border: `1px solid ${colors.border}`,
        background: "#f8fafc"
      }}
    >
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
        Daily Pulse
      </div>
      <h2 style={{ margin: "0 0 6px 0", fontSize: 24 }}>You&apos;re done for now.</h2>
      <p style={{ margin: "0 0 14px 0", color: colors.textMuted }}>
        You handled today&apos;s pulse. Check back later if something new comes up.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, max-content))",
          gap: 10
        }}
      >
        <Link href="/obligations" style={buttonStyles.link}>
          View obligations
        </Link>
        <Link href="/" style={buttonStyles.link}>
          Return to dashboard
        </Link>
        <button type="button" onClick={onRefresh} style={buttonStyles.secondary}>
          Refresh pulse
        </button>
      </div>
    </section>
  );
}
