import type { DashboardInsightCard as DashboardInsightCardType } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

type Props = {
  card: DashboardInsightCardType;
};

export default function InsightCard({ card }: Props) {
  return (
    <article style={{ ...cardStyles.item, ...getToneStyle(card.tone) }}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>{card.title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{card.value}</div>
      <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>{card.supportingText}</p>
    </article>
  );
}

function getToneStyle(tone: DashboardInsightCardType["tone"]) {
  if (tone === "warning") {
    return {
      borderColor: "#fdba74",
      background: "#fffbeb"
    };
  }

  if (tone === "positive") {
    return {
      borderColor: "#86efac",
      background: "#f0fdf4"
    };
  }

  return {
    borderColor: "#d1d5db",
    background: "#f9fafb"
  };
}
