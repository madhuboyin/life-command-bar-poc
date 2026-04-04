import type { ConfidenceBand } from "../lib/types";
import { colors, radius } from "../lib/ui";

type Props = {
  confidenceBand: ConfidenceBand;
  needsReview?: boolean;
};

export default function ConfidenceBadge({ confidenceBand, needsReview = false }: Props) {
  const tone =
    confidenceBand === "HIGH"
      ? { bg: colors.successBg, text: colors.successText }
      : confidenceBand === "MEDIUM"
        ? { bg: "#fef3c7", text: "#92400e" }
        : { bg: colors.errorBg, text: colors.errorText };

  const reviewLabel =
    confidenceBand === "HIGH"
      ? "High confidence"
      : confidenceBand === "MEDIUM"
        ? "Medium confidence - review suggested"
        : "Low confidence - needs confirmation";

  return (
    <span
      title={reviewLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: radius.pill,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        background: tone.bg,
        color: tone.text
      }}
    >
      {confidenceBand}
      {needsReview && confidenceBand !== "HIGH" ? " · Review" : ""}
    </span>
  );
}
