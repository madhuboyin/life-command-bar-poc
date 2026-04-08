"use client";

import Link from "next/link";
import { useState } from "react";
import { confirmObligationCandidate, rejectObligationCandidate } from "../lib/api";
import type { ReviewQueueItem } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import {
  buildActionLabel,
  buildRecommendationMessage
} from "../lib/human-language.service";
import {
  buildActionAftercareMessage,
  buildDecisionConfidenceMessage,
  buildPrimaryReassurance
} from "../lib/emotional-trust.service";
import ConfidenceBadge from "./confidence-badge";
import ReassuranceInline from "./reassurance-inline";
import SharedContextNote from "./shared-context-note";
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
  const reviewMessage = buildRecommendationMessage({
    recommendationType: "REVIEW",
    issue: item.reviewReasons[0] ?? null,
    reason: item.reviewReasons[0] ?? null
  });
  const decisionConfidence = buildDecisionConfidenceMessage({
    confidenceBand: item.confidenceBand,
    actionType: "REVIEW"
  });
  const reassurance = buildPrimaryReassurance({
    confidenceBand: item.confidenceBand,
    needsReview: true,
    actionType: "REVIEW",
    scopeType: item.scopeType,
    assigneeName: item.assignee?.name ?? item.assignee?.email ?? null
  });

  async function handleConfirm() {
    try {
      setLoading("confirm");
      await confirmObligationCandidate(item.id, { status: "ACTIVE" });
      await onUpdated();
      const aftercare = buildActionAftercareMessage({ actionType: "REVIEW", trackAction: true });
      showToast({
        variant: "success",
        title: aftercare.primary,
        description: aftercare.supporting ?? item.title
      });
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
      const aftercare = buildActionAftercareMessage({ actionType: "IGNORE", trackAction: true });
      showToast({
        variant: "success",
        title: aftercare.primary,
        description: aftercare.supporting ?? item.title
      });
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

      <ReassuranceInline
        compact
        message={{
          ...decisionConfidence,
          primary: reviewMessage.primary,
          supporting: reviewMessage.context ?? reassurance.supporting ?? decisionConfidence.supporting
        }}
      />

      {intelligence && reviewMessage.context ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          {reviewMessage.context}
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
          {lifecycleType ? "Subscription details found" : ""}
          {lifecycleType && lifecyclePlan ? " · " : ""}
          {lifecyclePlan ? `Plan ${lifecyclePlan}` : ""}
          {(lifecycleType || lifecyclePlan) && lifecycleRecurringPrice !== null ? " · " : ""}
          {lifecycleRecurringPrice !== null
            ? `Recurring ${lifecycleRecurringPrice}${item.currency ? ` ${item.currency}` : ""}`
            : ""}
          {(lifecycleType || lifecyclePlan || lifecycleRecurringPrice !== null) &&
          lifecycleAmountCharged !== null
            ? " · "
            : ""}
          {lifecycleAmountCharged !== null
            ? `Last charge ${lifecycleAmountCharged}${item.currency ? ` ${item.currency}` : ""}`
            : ""}
        </div>
      ) : null}

      {lifecycleVendorName || lifecycleRoutingReason ? (
        <div style={{ fontSize: 12, color: colors.textMuted }}>
          {lifecycleVendorName ? `Vendor ${lifecycleVendorName}` : ""}
          {lifecycleVendorName && lifecycleVendorCategory ? ` (${lifecycleVendorCategory})` : ""}
          {lifecycleVendorName && lifecycleVendorScore !== null ? " · Match found" : ""}
          {lifecycleRoutingReason ? ` · ${lifecycleRoutingReason.replace(/_/g, " ")}` : ""}
        </div>
      ) : null}

      <SharedContextNote
        scopeType={item.scopeType}
        assigneeName={item.assignee?.name ?? item.assignee?.email ?? null}
        dueSoon={Boolean(item.dueDate)}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading !== null}
          style={buttonStyles.primary}
        >
          {loading === "confirm" ? "Confirming..." : buildActionLabel("confirm")}
        </button>
        <Link href={`/obligations/${item.id}/review`} style={buttonStyles.link}>
          {buildActionLabel("review")}
        </Link>
        <button
          type="button"
          onClick={handleReject}
          disabled={loading !== null}
          style={buttonStyles.danger}
        >
          {loading === "reject" ? "Rejecting..." : buildActionLabel("ignore")}
        </button>
      </div>
    </article>
  );
}
