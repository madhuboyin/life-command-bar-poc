"use client";

import type { DecisionTrace, WhyExplanation } from "../lib/types";
import { colors } from "../lib/ui";

type Props = {
  why: WhyExplanation;
  decisionTrace?: DecisionTrace;
};

export default function WhyThisExplanation({ why, decisionTrace }: Props) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 14 }}>
        <strong>Why this:</strong> {why.primaryReason}
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: 13, color: colors.textMuted }}>
          See reasoning
        </summary>
        <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted, display: "grid", gap: 6 }}>
          <div>Signals: {why.signals.join(", ") || "none"}</div>
          <div>Confidence: {Math.round(why.confidence * 100)}%</div>
          {why.personalizationReason ? <div>{why.personalizationReason}</div> : null}
          {decisionTrace ? (
            <div>
              Trace: {decisionTrace.rankingFactors.join(" · ")}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
