import { cardStyles, colors } from "../lib/ui";
import type { TodayFeedResponse } from "../lib/types";

type Props = {
  data: TodayFeedResponse;
};

export default function DashboardSummaryStrip({ data }: Props) {
  const urgentCount = data.items.filter((item) => item.hookType === "urgent").length;
  const moneyCount = data.items.filter((item) => item.hookType === "money").length;
  const quickWinCount = data.items.filter((item) => item.hookType === "quick_win").length;

  const stats = [
    { label: "Feed Items", value: data.items.length },
    { label: "Urgent", value: urgentCount },
    { label: "Money Items", value: moneyCount },
    { label: "Quick Wins", value: quickWinCount }
  ];

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 12,
        marginBottom: 24
      }}
    >
      {stats.map((stat) => (
        <article key={stat.label} style={cardStyles.item}>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
            {stat.label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{stat.value}</div>
        </article>
      ))}
    </section>
  );
}
