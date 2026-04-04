import type { DailyPulseMomentum } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

type Props = {
  momentum: DailyPulseMomentum;
  quickSummary: string;
};

export default function PulseMomentumCard({ momentum, quickSummary }: Props) {
  const trendSymbol =
    momentum.trend === "up" ? "↑" : momentum.trend === "down" ? "↓" : "→";

  return (
    <section style={cardStyles.bordered}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
        Momentum
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        You handled {momentum.todayCompleted} today · {momentum.handledThisWeek} this week{" "}
        {trendSymbol}
      </div>
      <div style={{ fontSize: 14, color: colors.textMuted, marginBottom: 4 }}>
        {momentum.completionMessage}
      </div>
      <div style={{ fontSize: 14, color: colors.textMuted }}>{quickSummary}</div>
    </section>
  );
}
