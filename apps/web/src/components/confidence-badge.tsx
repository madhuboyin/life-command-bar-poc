import type { ConfidenceBand } from "../lib/types";
import { buildSummaryMessage } from "../lib/human-language.service";
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
  const message = buildSummaryMessage({
    confidence: confidenceBand,
    issue: needsReview && confidenceBand !== "HIGH" ? "LOW_CONFIDENCE" : null
  });

  const reviewLabel = message.context ? `${message.primary}. ${message.context}` : message.primary;

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
      {message.primary}
    </span>
  );
}
