import type { PredictionItem, PredictionSummaryItem } from "../lib/types";
import { colors } from "../lib/ui";

type Props = {
  item: Pick<PredictionSummaryItem, "rationaleSummary"> | Pick<PredictionItem, "rationaleSummary">;
};

export default function PredictionRationale({ item }: Props) {
  if (!item.rationaleSummary) {
    return (
      <div style={{ fontSize: 13, color: colors.textMuted }}>
        Based on what you&apos;ve handled before.
      </div>
    );
  }

  return <div style={{ fontSize: 13, color: colors.textMuted }}>{item.rationaleSummary}</div>;
}
