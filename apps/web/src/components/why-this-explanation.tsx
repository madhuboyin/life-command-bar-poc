"use client";

import type { DecisionTrace, WhyExplanation } from "../lib/types";
import { colors } from "../lib/ui";

type Props = {
  why?: WhyExplanation | null;
  decisionTrace?: DecisionTrace | null;
};

export default function WhyThisExplanation({ why, decisionTrace }: Props) {
  const primaryReason =
    typeof why?.primaryReason === "string" && why.primaryReason.trim().length > 0
      ? why.primaryReason
      : "This was prioritized using current urgency, importance, and confidence signals.";
  const signals =
    Array.isArray(why?.signals) && why.signals.length > 0
      ? why.signals
      : ["system_priority"];
  const confidence =
    typeof why?.confidence === "number" && Number.isFinite(why.confidence)
      ? Math.round(why.confidence * 100)
      : null;
  const personalizationReason =
    typeof why?.personalizationReason === "string" ? why.personalizationReason : null;
  const rankingFactors =
    Array.isArray(decisionTrace?.rankingFactors) && decisionTrace.rankingFactors.length > 0
      ? decisionTrace.rankingFactors
      : [];

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 14 }}>
        <strong>Why this:</strong> {primaryReason}
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, color: colors.textMuted }}>
          See reasoning
        </summary>
        <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted, display: "grid", gap: 6 }}>
          <div>Signals: {signals.join(", ")}</div>
          <div>Confidence: {confidence !== null ? `${confidence}%` : "n/a"}</div>
          {personalizationReason ? <div>{personalizationReason}</div> : null}
          {rankingFactors.length > 0 ? (
            <div>
              Trace: {rankingFactors.join(" · ")}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
