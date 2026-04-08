"use client";

import { buttonStyles, cardStyles, colors } from "../lib/ui";

type Props = {
  title?: string;
  description?: string;
  loading?: boolean;
  submitted?: boolean;
  onHelpful: () => Promise<void>;
  onNotHelpful: () => Promise<void>;
};

export default function OutcomeFeedbackPrompt({
  title = "Was this helpful?",
  description = "A quick note helps future suggestions stay relevant.",
  loading = false,
  submitted = false,
  onHelpful,
  onNotHelpful
}: Props) {
  return (
    <section style={cardStyles.bordered}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ color: colors.textMuted, marginBottom: 12 }}>{description}</div>

      {submitted ? (
        <div style={{ color: colors.textMuted, fontSize: 14 }}>Thanks, feedback saved.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, max-content))",
            gap: 10
          }}
        >
          <button
            onClick={() => {
              void onHelpful();
            }}
            disabled={loading}
            style={buttonStyles.secondary}
          >
            {loading ? "Saving..." : "Yes"}
          </button>
          <button
            onClick={() => {
              void onNotHelpful();
            }}
            disabled={loading}
            style={buttonStyles.secondary}
          >
            {loading ? "Saving..." : "Not really"}
          </button>
        </div>
      )}
    </section>
  );
}
