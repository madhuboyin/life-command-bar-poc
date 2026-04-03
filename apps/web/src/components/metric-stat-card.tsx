import { cardStyles, colors } from "../lib/ui";

type Props = {
  label: string;
  value: string | number;
  supportingText?: string;
};

export default function MetricStatCard({ label, value, supportingText }: Props) {
  return (
    <article style={cardStyles.item}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      {supportingText ? (
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>{supportingText}</div>
      ) : null}
    </article>
  );
}
