import { buildDecisionConfidenceMessage } from "../lib/emotional-trust.service";
import { colors, radius } from "../lib/ui";

type Props = {
  confidenceBand?: "HIGH" | "MEDIUM" | "LOW" | number | null;
  actionType?: string | null;
};

export default function DecisionConfidenceBadge({
  confidenceBand,
  actionType
}: Props) {
  const message = buildDecisionConfidenceMessage({
    confidenceBand,
    actionType
  });
  const tone =
    message.emotionalState === "CALM_CLEAR"
      ? { bg: colors.successBg, text: colors.successText }
      : message.emotionalState === "REVIEW_NEEDED"
        ? { bg: colors.quickWinBg, text: colors.quickWinText }
        : { bg: colors.errorBg, text: colors.errorText };

  return (
    <span
      title={message.supporting}
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
