import type { ConfidenceBand } from "../lib/types";

type Props = {
  confidenceBand: ConfidenceBand;
};

export default function PredictionConfidenceBadge({ confidenceBand }: Props) {
  const style = getStyle(confidenceBand);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        ...style
      }}
    >
      {confidenceBand === "HIGH"
        ? "High confidence"
        : confidenceBand === "MEDIUM"
          ? "Medium confidence"
          : "Low confidence"}
    </span>
  );
}

function getStyle(confidenceBand: ConfidenceBand) {
  if (confidenceBand === "HIGH") {
    return {
      background: "#dcfce7",
      color: "#166534"
    };
  }

  if (confidenceBand === "MEDIUM") {
    return {
      background: "#fef3c7",
      color: "#92400e"
    };
  }

  return {
    background: "#fee2e2",
    color: "#991b1b"
  };
}
