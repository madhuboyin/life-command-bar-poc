import type { AutoFlowItemSummary } from "../lib/types";
import { radius } from "../lib/ui";

type Props = {
  autoFlow: AutoFlowItemSummary;
};

export default function AutoFlowBadge({ autoFlow }: Props) {
  const tone =
    autoFlow.state === "READY"
      ? { background: "#dcfce7", color: "#166534" }
      : { background: "#fef3c7", color: "#92400e" };

  const label =
    autoFlow.state === "READY"
      ? "Ready now"
      : autoFlow.triggerType === "PATTERN_TRIGGER"
        ? "Quick win"
        : autoFlow.triggerType === "REMINDER_TRIGGER" ||
            autoFlow.triggerType === "URGENCY_TRIGGER"
        ? "Needs attention"
        : "Suggested";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: radius.pill,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        background: tone.background,
        color: tone.color
      }}
    >
      {label}
    </span>
  );
}
