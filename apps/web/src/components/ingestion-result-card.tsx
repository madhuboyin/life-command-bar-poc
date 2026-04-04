"use client";

import Link from "next/link";
import type { IngestionResult } from "../lib/types";
import { cardStyles, colors, formatDateTime } from "../lib/ui";

type Props = {
  result: IngestionResult;
};

export default function IngestionResultCard({ result }: Props) {
  const candidateId = result.candidateId ?? result.obligationId;
  const statusColor =
    result.confidenceBand === "HIGH"
      ? colors.successText
      : result.confidenceBand === "MEDIUM"
        ? "#92400e"
        : colors.errorText;

  return (
    <section style={{ ...cardStyles.bordered, marginTop: 14 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>Ingestion Result</h3>
      <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
        <div>
          <strong>Status:</strong> {result.status}
        </div>
        <div>
          <strong>Confidence:</strong>{" "}
          <span style={{ color: statusColor }}>
            {Math.round(result.confidence * 100)}% ({result.confidenceBand})
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
        </div>
      ) : (
        <div style={{ marginTop: 10, color: colors.textMuted }}>
          Not enough signal to create a candidate. Try adding a due date, vendor, or amount.
        </div>
      )}
    </section>
  );
}
