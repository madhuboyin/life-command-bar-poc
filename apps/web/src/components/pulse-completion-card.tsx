import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import {
  buildActionLabel,
  buildEmptyStateMessage
} from "../lib/human-language.service";

type Props = {
  onRefresh: () => void;
};

export default function PulseCompletionCard({ onRefresh }: Props) {
  const message = buildEmptyStateMessage("daily_pulse");
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
      <h2 style={{ margin: "0 0 6px 0", fontSize: 24 }}>{message.primary}</h2>
      <p style={{ margin: "0 0 14px 0", color: colors.textMuted }}>
        {message.context ?? "Check back later if something new comes up."}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, max-content))",
          gap: 10
        }}
      >
        <Link
          href="/focus"
          style={{
            ...buttonStyles.primary,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center"
          }}
        >
          Start Focus Mode
        </Link>
        <Link href="/obligations" style={buttonStyles.link}>
          {buildActionLabel("details")}
        </Link>
        <Link href="/" style={buttonStyles.link}>
          Return to dashboard
        </Link>
        <button type="button" onClick={onRefresh} style={buttonStyles.secondary}>
          Refresh
        </button>
      </div>
    </section>
  );
}
