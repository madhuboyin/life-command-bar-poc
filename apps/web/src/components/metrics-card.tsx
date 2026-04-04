import { cardStyles, colors } from "../lib/ui";

type Props = {
  title: string;
  value: number | string;
  subtitle?: string;
  hint?: string;
};

export default function MetricsCard({ title, value, subtitle, hint }: Props) {
  return (
    <article style={cardStyles.item}>
      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15 }}>{value}</div>
      {subtitle ? (
        <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted }}>{subtitle}</div>
      ) : null}
      {hint ? (
        <div style={{ marginTop: 6, fontSize: 12, color: colors.textMuted }}>{hint}</div>
      ) : null}
    </article>
  );
}
