import type { DashboardTopInsight } from "../lib/types";
import { cardStyles } from "../lib/ui";

type Props = {
  insight: DashboardTopInsight;
};

export default function TopInsightCard({ insight }: Props) {
  return (
    <article style={{ ...cardStyles.item, ...getToneStyle(insight.tone), padding: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
        Top insight
      </div>
      <h3 style={{ margin: "0 0 6px 0", fontSize: 20 }}>{insight.title}</h3>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{insight.description}</p>
    </article>
  );
}

function getToneStyle(tone: DashboardTopInsight["tone"]) {
  if (tone === "warning") {
    return {
      background: "#fff7ed",
      borderColor: "#fed7aa",
      color: "#9a3412"
    };
  }

  if (tone === "positive") {
    return {
      background: "#ecfdf5",
      borderColor: "#bbf7d0",
      color: "#166534"
    };
  }

  return {
    background: "#f8fafc",
    borderColor: "#dbeafe",
    color: "#1e3a8a"
  };
}
