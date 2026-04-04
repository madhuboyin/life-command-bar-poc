import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";

type Props = {
  completionMessage: string | null;
};

export default function FocusSessionCompleteCard({ completionMessage }: Props) {
  return (
    <section
      style={{
        ...cardStyles.section,
        border: `1px solid ${colors.border}`,
        background: "#f8fafc"
      }}
    >
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>Focus Mode</div>
      <h2 style={{ margin: "0 0 6px 0", fontSize: 24 }}>You&apos;re done for now</h2>
      <p style={{ margin: "0 0 14px 0", color: colors.textMuted }}>
        {completionMessage ?? "Nice focused progress. You can return anytime for another short session."}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, max-content))",
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
          Start another session
        </Link>
        <Link href="/" style={buttonStyles.link}>
          Return to dashboard
        </Link>
      </div>
    </section>
  );
}
