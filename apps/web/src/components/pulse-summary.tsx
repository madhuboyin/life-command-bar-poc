import type { DailyPulseResponse } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";

type Props = {
  pulse: DailyPulseResponse;
};

export default function PulseSummary({ pulse }: Props) {
  const trendSymbol =
    pulse.momentum.trend === "up"
      ? "↑"
      : pulse.momentum.trend === "down"
        ? "↓"
        : "→";

  return (
    <section style={cardStyles.bordered}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>Momentum</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        You cleared {pulse.momentum.handledThisWeek} this week {trendSymbol}
      </div>
      <div style={{ fontSize: 14, color: colors.textMuted }}>{pulse.quickSummary}</div>
    </section>
  );
}
