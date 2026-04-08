import { colors, radius } from "../lib/ui";
import type { SubscriptionOptimizationHealth } from "../lib/types";
import { getUserFacingText } from "../lib/human-language.service";

export default function SubscriptionHealthBadge({
  health
}: {
  health: SubscriptionOptimizationHealth;
}) {
  const style = resolveStyle(health.band);
  const label =
    health.band === "GOOD"
      ? getUserFacingText("status.looks_good")
      : health.band === "FAIR"
        ? getUserFacingText("status.needs_review")
        : getUserFacingText("status.not_sure_yet");
  return (
    <span
      style={{
        borderRadius: radius.pill,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        background: style.background,
        color: style.color
      }}
    >
      {label}
    </span>
  );
}

function resolveStyle(band: SubscriptionOptimizationHealth["band"]) {
  if (band === "GOOD") {
    return {
      background: colors.successBg,
      color: colors.successText
    };
  }
  if (band === "AT_RISK") {
    return {
      background: colors.dangerBg,
      color: colors.dangerText
    };
  }
  return {
    background: colors.quickWinBg,
    color: colors.quickWinText
  };
}
