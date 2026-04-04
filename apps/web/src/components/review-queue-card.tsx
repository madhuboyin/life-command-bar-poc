"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmObligationCandidate, rejectObligationCandidate } from "../lib/api";
import type { ReviewQueueItem } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import ConfidenceBadge from "./confidence-badge";
import SourceBadge from "./source-badge";
import { useToast } from "./ui/toast-provider";

type Props = {
  item: ReviewQueueItem;
  onUpdated: () => Promise<void>;
};

export default function ReviewQueueCard({ item, onUpdated }: Props) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<"confirm" | "reject" | null>(null);
  const gmailSource =
    item.sourceMetadata?.sourceSubtype === "GMAIL_READONLY" &&
    item.sourceMetadata.rawData &&
    typeof item.sourceMetadata.rawData === "object"
      ? (item.sourceMetadata.rawData as Record<string, unknown>)
      : null;
  const gmailFrom = typeof gmailSource?.from === "string" ? gmailSource.from : null;
  const gmailSubject = typeof gmailSource?.subject === "string" ? gmailSource.subject : null;

  async function handleConfirm() {
    try {
      setLoading("confirm");
      await confirmObligationCandidate(item.id, { status: "ACTIVE" });
      await onUpdated();
      showToast({ variant: "success", title: "Item confirmed", description: item.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not confirm item";
      showToast({ variant: "error", title: "Confirm failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    try {
      setLoading("reject");
      await rejectObligationCandidate(item.id, "Rejected from review queue");
      await onUpdated();
      showToast({ variant: "success", title: "Item rejected", description: item.title });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reject item";
      showToast({ variant: "error", title: "Reject failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 6px 0" }}>{item.title}</h3>
          <div style={{ fontSize: 13, color: colors.textMuted }}>{item.type}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <SourceBadge
            sourceType={item.sourceType}
            label={item.sourceMetadata?.provenanceLabel}
          />
          <ConfidenceBadge
            confidenceBand={item.confidenceBand}
            needsReview={item.needsReview}
          />
        </div>
      </div>

      <div style={{ fontSize: 13, color: colors.textMuted }}>
        {item.reviewReasons.join(" · ")}
      </div>

      {gmailFrom || gmailSubject ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          {gmailFrom ? `From: ${gmailFrom}` : ""}
          {gmailFrom && gmailSubject ? " · " : ""}
          {gmailSubject ? `Subject: ${gmailSubject}` : ""}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading !== null}
          style={buttonStyles.primary}
        >
          {loading === "confirm" ? "Confirming..." : "Confirm"}
        </button>
        <Link href={`/obligations/${item.id}/review`} style={buttonStyles.link}>
          Edit first
        </Link>
        <button
          type="button"
          onClick={handleReject}
          disabled={loading !== null}
          style={buttonStyles.danger}
        >
          {loading === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>
    </article>
  );
}
