import { cardStyles, colors } from "../lib/ui";

type Props = {
  line: string;
  progressPercent: number;
  remainingCount: number;
};

export default function FocusSessionProgress({ line, progressPercent, remainingCount }: Props) {
  return (
    <section style={cardStyles.bordered}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Session progress</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{line}</div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "#e5e7eb",
          overflow: "hidden",
          marginBottom: 8
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, progressPercent))}%`,
            height: "100%",
            background: "#111827"
          }}
        />
      </div>
      <div style={{ fontSize: 13, color: colors.textMuted }}>
        {remainingCount === 0
          ? "You are done for now."
          : `${remainingCount} item${remainingCount === 1 ? "" : "s"} remaining.`}
      </div>
    </section>
  );
}
