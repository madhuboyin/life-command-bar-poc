import { cardStyles, colors } from "../lib/ui";
import ClickableCardLink from "./ui/clickable-card-link";

type Props = {
  label: string;
  value: string | number;
  supportingText?: string;
  href?: string | null;
};

export default function MetricStatCard({ label, value, supportingText, href }: Props) {
  const content = (
    <article style={cardStyles.item}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      {supportingText ? (
        <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 8 }}>{supportingText}</div>
      ) : null}
      {href ? (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#1d4ed8" }}>
          View items →
        </div>
      ) : null}
    </article>
  );

  if (!href) return content;

  return (
    <ClickableCardLink href={href} ariaLabel={`${label}: view filtered obligations`}>
      {content}
    </ClickableCardLink>
  );
}
