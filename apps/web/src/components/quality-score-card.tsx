import { cardStyles, colors } from "../lib/ui";

type Props = {
  title: string;
  score: number;
  subtitle?: string;
};

export default function QualityScoreCard({ title, score, subtitle }: Props) {
  const rounded = Math.round(score);
  const tone = rounded >= 80 ? colors.successText : rounded >= 60 ? "#b45309" : colors.errorText;

  return (
    <article style={cardStyles.item}>
      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 34, fontWeight: 800, color: tone, lineHeight: 1 }}>{rounded}</div>
        <div style={{ fontSize: 14, color: colors.textMuted }}>/ 100</div>
      </div>
      <div
        style={{
          marginTop: 10,
          width: "100%",
          height: 8,
          borderRadius: 999,
          background: colors.border
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, rounded))}%`,
            height: "100%",
            borderRadius: 999,
            background: tone,
            transition: "width 220ms ease"
          }}
        />
      </div>
      {subtitle ? (
        <div style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>{subtitle}</div>
      ) : null}
    </article>
  );
}
