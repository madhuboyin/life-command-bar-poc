"use client";

import { useState } from "react";
import { confirmPrediction, dismissPrediction } from "../lib/api";
import type { PredictionItem, PredictionSummaryItem } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import { buildActionLabel } from "../lib/human-language.service";
import PredictionConfidenceBadge from "./prediction-confidence-badge";
import PredictionRationale from "./prediction-rationale";

type Props = {
  item: PredictionSummaryItem | PredictionItem;
  compact?: boolean;
  showActions?: boolean;
  onChanged?: () => Promise<void> | void;
};

export default function PredictionCard({
  item,
  compact = false,
  showActions = false,
  onChanged
}: Props) {
  const [loading, setLoading] = useState<"confirm" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const predictedDateLabel = item.predictedDate
    ? new Date(item.predictedDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    : null;

  async function handleConfirm() {
    try {
      setLoading("confirm");
      setError(null);
      await confirmPrediction(item.id, false);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm prediction");
    } finally {
      setLoading(null);
    }
  }

  async function handleDismiss() {
    try {
      setLoading("dismiss");
      setError(null);
      await dismissPrediction(item.id, "dismissed_from_prediction_card");
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss prediction");
    } finally {
      setLoading(null);
    }
  }

  return (
    <article style={{ ...cardStyles.item, padding: compact ? 12 : 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: colors.textMuted }}>Upcoming</div>
        <PredictionConfidenceBadge confidenceBand={item.confidenceBand} />
      </div>

      <h3 style={{ margin: "6px 0", fontSize: compact ? 17 : 19 }}>{item.title}</h3>
      {item.description ? (
        <p style={{ margin: "0 0 8px 0", color: colors.textMuted, fontSize: 14 }}>{item.description}</p>
      ) : null}

      <div style={{ fontSize: 13, marginBottom: 8 }}>
        {predictedDateLabel ? `Expected around ${predictedDateLabel}` : "Expected soon"}
      </div>

      <PredictionRationale item={item} />

      {error ? (
        <div style={{ fontSize: 12, color: "#991b1b", marginTop: 8 }}>{error}</div>
      ) : null}

      {showActions ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, max-content))",
            gap: 8,
            marginTop: 10
          }}
        >
          <button type="button" onClick={() => void handleConfirm()} disabled={loading !== null} style={buttonStyles.secondary}>
            {loading === "confirm" ? "Saving..." : buildActionLabel("confirm")}
          </button>
          <button type="button" onClick={() => void handleDismiss()} disabled={loading !== null} style={buttonStyles.danger}>
            {loading === "dismiss" ? "Saving..." : buildActionLabel("ignore")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
