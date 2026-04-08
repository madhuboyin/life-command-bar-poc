"use client";

import type { DecisionTrace, WhyExplanation } from "../lib/types";
import {
  buildWhyMessage,
  getUserFacingText
} from "../lib/human-language.service";
import WhyThisToggle from "./why-this-toggle";

type Props = {
  why?: WhyExplanation | null;
  decisionTrace?: DecisionTrace | null;
};

export default function WhyThisExplanation({ why, decisionTrace }: Props) {
  const confidenceBand =
    typeof why?.confidence === "number"
      ? why.confidence >= 0.75
        ? "HIGH"
        : why.confidence >= 0.5
          ? "MEDIUM"
          : "LOW"
      : null;
  const message = buildWhyMessage({
    primaryReason: why?.primaryReason,
    context: why?.personalizationReason,
    source: why?.signals?.join(" "),
    confidence: confidenceBand
  });
  const rankingFactors =
    Array.isArray(decisionTrace?.rankingFactors) && decisionTrace.rankingFactors.length > 0
      ? decisionTrace.rankingFactors
      : [];
  const traceLine =
    rankingFactors.length > 0
      ? rankingFactors.slice(0, 3).map((item) => item.replace(/_/g, " ")).join(" · ")
      : null;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{message.primary}</div>
      {message.context ? (
        <div style={{ fontSize: 13, opacity: 0.8 }}>{message.context}</div>
      ) : null}
      <WhyThisToggle label="Why this?">
        <div style={{ display: "grid", gap: 6 }}>
          <div>{message.why ?? getUserFacingText("why.default_context")}</div>
          {traceLine ? <div>{traceLine}</div> : null}
        </div>
      </WhyThisToggle>
    </div>
  );
}
