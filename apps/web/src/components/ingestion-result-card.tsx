"use client";

import Link from "next/link";
import { useState } from "react";
import { createFeedback } from "../lib/api";
import type { IngestionResult } from "../lib/types";
import { buttonStyles, cardStyles, colors, formatDateTime } from "../lib/ui";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  result: IngestionResult;
  sourceLabel?: string;
};

export default function IngestionResultCard({ result, sourceLabel }: Props) {
  const { showToast } = useToast();
  const [feedbackState, setFeedbackState] = useState<"saved" | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const candidateId = result.candidateId ?? result.obligationId;
  const statusColor =
    result.confidenceBand === "HIGH"
      ? colors.successText
      : result.confidenceBand === "MEDIUM"
        ? "#92400e"
        : colors.errorText;
  const confidenceLabel =
    result.confidenceBand === "HIGH"
      ? "Looks clear"
      : result.confidenceBand === "MEDIUM"
        ? "Worth a quick check"
        : "Not sure yet";

  return (
    <section style={{ ...cardStyles.bordered, marginTop: 14 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Ingestion Result</h3>
      <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
        {sourceLabel ? (
          <div>
            <strong>Source:</strong> {sourceLabel}
          </div>
        ) : null}
        <div>
          <strong>Status:</strong> {result.status}
        </div>
        <div>
          <strong>How clear:</strong>{" "}
          <span style={{ color: statusColor }}>
            {confidenceLabel}
          </span>
        </div>
        <div>
          <strong>Parse:</strong> {result.parseStatus}
        </div>
        {result.isDuplicate && result.duplicateOfObligationId ? (
          <div style={{ color: colors.textMuted }}>
            Duplicate capture detected for obligation {result.duplicateOfObligationId}.
          </div>
        ) : null}
        {result.conflictDetected && result.conflictWithObligationId ? (
          <div style={{ color: "#92400e" }}>
            Potential conflict with obligation {result.conflictWithObligationId}.
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 14 }}>
        <div><strong>Type:</strong> {result.extracted.type}</div>
        <div><strong>Title:</strong> {result.extracted.title ?? "—"}</div>
        <div><strong>Vendor:</strong> {result.extracted.vendor ?? "—"}</div>
        <div>
          <strong>Amount:</strong>{" "}
          {result.extracted.amount !== null
            ? `${result.extracted.amount} ${result.extracted.currency ?? ""}`.trim()
            : "—"}
        </div>
        <div><strong>Due:</strong> {formatDateTime(result.extracted.dueDate)}</div>
        <div><strong>Recurrence:</strong> {result.extracted.recurrence ?? "—"}</div>
      </div>

      {candidateId ? (
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/obligations/${candidateId}`} style={{ color: "#2563eb", textDecoration: "none" }}>
            Open obligation
          </Link>
          {result.needsReview ? (
            <Link
              href={`/obligations/${candidateId}/review`}
              style={{ color: "#2563eb", textDecoration: "none" }}
            >
              Review draft
            </Link>
          ) : null}
          <button
            type="button"
            style={buttonStyles.secondary}
            onClick={() => {
              void submitFeedback("ACCEPTED");
            }}
          >
            Looks correct
          </button>
          <button
            type="button"
            style={buttonStyles.secondary}
            onClick={() => {
              void submitFeedback("WRONG_INFO");
            }}
          >
            Wrong info
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10, color: colors.textMuted }}>
          We need a bit more detail before creating a draft. Try adding a due date, vendor, or amount.
        </div>
      )}
      {feedbackState === "saved" ? (
        <StatusMessage variant="success">Feedback saved. Thank you.</StatusMessage>
      ) : null}
      {feedbackError ? <StatusMessage variant="error">{feedbackError}</StatusMessage> : null}
    </section>
  );

  async function submitFeedback(type: "ACCEPTED" | "WRONG_INFO") {
    if (!candidateId) return;
    try {
      setFeedbackError(null);
      await createFeedback({
        obligationId: candidateId,
        type,
        note:
          type === "ACCEPTED"
            ? "Ingestion result confirmed by user."
            : "Ingestion result marked as incorrect."
      });
      setFeedbackState("saved");
      showToast({
        variant: "success",
        title: "Feedback saved",
        description: type === "ACCEPTED" ? "Marked as correct" : "Marked as incorrect"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save feedback";
      setFeedbackError(message);
      showToast({ variant: "error", title: "Feedback failed", description: message });
    }
  }
}
