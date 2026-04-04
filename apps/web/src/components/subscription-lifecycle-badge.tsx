"use client";

import type { SubscriptionLifecycleState } from "../lib/types";
import { colors, radius } from "../lib/ui";

export default function SubscriptionLifecycleBadge({
  state
}: {
  state: SubscriptionLifecycleState;
}) {
  const style = lifecycleStyle(state);
  return (
    <span
      style={{
        borderRadius: radius.pill,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        background: style.bg,
        color: style.text
      }}
    >
      {labelForState(state)}
    </span>
  );
}

function lifecycleStyle(state: SubscriptionLifecycleState) {
  if (state === "ACTIVE" || state === "RENEWING") {
    return { bg: "#dcfce7", text: "#166534" };
  }
  if (state === "PRICE_CHANGED") {
    return { bg: "#fef3c7", text: "#92400e" };
  }
  if (state === "CANCELING" || state === "CANCELED" || state === "ENDED" || state === "INACTIVE") {
    return { bg: "#fee2e2", text: "#991b1b" };
  }
  if (state === "TRIALING" || state === "DISCOVERED") {
    return { bg: "#dbeafe", text: "#1d4ed8" };
  }
  return { bg: colors.neutralBadgeBg, text: colors.neutralBadgeText };
}

function labelForState(state: SubscriptionLifecycleState) {
  return state.toLowerCase().replace(/_/g, " ");
}
