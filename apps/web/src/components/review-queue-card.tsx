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
  const gmailLifecycle =
    gmailSource?.subscriptionLifecycle &&
    typeof gmailSource.subscriptionLifecycle === "object"
      ? (gmailSource.subscriptionLifecycle as Record<string, unknown>)
      : null;
  const lifecycleType =
    typeof gmailLifecycle?.lifecycleEmailType === "string"
      ? gmailLifecycle.lifecycleEmailType
      : null;
  const lifecycleExtraction =
    gmailLifecycle?.extraction && typeof gmailLifecycle.extraction === "object"
      ? (gmailLifecycle.extraction as Record<string, unknown>)
      : null;
  const lifecycleV2 =
    gmailLifecycle?.intelligenceV2 && typeof gmailLifecycle.intelligenceV2 === "object"
      ? (gmailLifecycle.intelligenceV2 as Record<string, unknown>)
      : null;
  const v2Vendor =
    lifecycleV2?.vendor && typeof lifecycleV2.vendor === "object"
      ? (lifecycleV2.vendor as Record<string, unknown>)
      : null;
  const v2Routing =
    lifecycleV2?.routing && typeof lifecycleV2.routing === "object"
      ? (lifecycleV2.routing as Record<string, unknown>)
      : null;
  const lifecyclePlan =
    typeof lifecycleExtraction?.planName === "string" ? lifecycleExtraction.planName : null;
  const lifecycleRecurringPrice =
    typeof lifecycleExtraction?.recurringPrice === "number"
      ? lifecycleExtraction.recurringPrice
      : null;
  const lifecycleAmountCharged =
    typeof lifecycleExtraction?.amountCharged === "number"
      ? lifecycleExtraction.amountCharged
      : null;
  const lifecycleVendorName =
    typeof v2Vendor?.canonicalName === "string"
      ? v2Vendor.canonicalName
      : typeof lifecycleExtraction?.vendor === "string"
        ? lifecycleExtraction.vendor
        : null;
  const lifecycleVendorCategory =
    typeof v2Vendor?.category === "string" ? v2Vendor.category : null;
  const lifecycleVendorScore = typeof v2Vendor?.score === "number" ? v2Vendor.score : null;
  const lifecycleRoutingReason =
    typeof v2Routing?.reason === "string" ? v2Routing.reason : null;
  const intelligence = item.obligationIntelligence;

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

      {intelligence ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          Category: {intelligence.category.replace(/_/g, " ").toLowerCase()} · Priority:{" "}
          {intelligence.priority.band.toLowerCase()} · Route:{" "}
          {intelligence.routing.route.toLowerCase().replace(/_/g, " ")}
        </div>
      ) : null}

      {gmailFrom || gmailSubject ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          {gmailFrom ? `From: ${gmailFrom}` : ""}
          {gmailFrom && gmailSubject ? " · " : ""}
          {gmailSubject ? `Subject: ${gmailSubject}` : ""}
        </div>
      ) : null}

      {lifecycleType || lifecyclePlan || lifecycleRecurringPrice !== null || lifecycleAmountCharged !== null ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          {lifecycleType ? `Lifecycle: ${lifecycleType}` : ""}
          {lifecycleType && lifecyclePlan ? " · " : ""}
          {lifecyclePlan ? `Plan: ${lifecyclePlan}` : ""}
          {(lifecycleType || lifecyclePlan) && lifecycleRecurringPrice !== null ? " · " : ""}
          {lifecycleRecurringPrice !== null
            ? `Recurring: ${lifecycleRecurringPrice}${item.currency ? ` ${item.currency}` : ""}`
            : ""}
          {(lifecycleType || lifecyclePlan || lifecycleRecurringPrice !== null) &&
          lifecycleAmountCharged !== null
            ? " · "
            : ""}
          {lifecycleAmountCharged !== null
            ? `Charged: ${lifecycleAmountCharged}${item.currency ? ` ${item.currency}` : ""}`
            : ""}
        </div>
      ) : null}

      {lifecycleVendorName || lifecycleRoutingReason ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          {lifecycleVendorName ? `Vendor intelligence: ${lifecycleVendorName}` : ""}
          {lifecycleVendorName && lifecycleVendorCategory ? ` (${lifecycleVendorCategory})` : ""}
          {lifecycleVendorName && lifecycleVendorScore !== null
            ? ` · score ${Math.round(lifecycleVendorScore * 100)}%`
            : ""}
          {lifecycleRoutingReason ? ` · Why review: ${lifecycleRoutingReason.replace(/_/g, " ")}` : ""}
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
