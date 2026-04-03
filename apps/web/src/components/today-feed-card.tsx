"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createFeedback,
  dismissObligation,
  getResolution,
  markObligationDone,
  postponeObligation
} from "../lib/api";
import type { ResolutionResponse, TodayFeedItem } from "../lib/types";
import {
  buttonStyles,
  cardStyles,
  colors,
  formatDateTime,
  getHookBadgeStyle
} from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import ResolutionModal from "./resolution-modal";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  item: TodayFeedItem;
  onRefresh: () => Promise<void>;
};

export default function TodayFeedCard({ item, onRefresh }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionResponse | null>(null);
  const [showResolution, setShowResolution] = useState(false);
  const { showToast } = useToast();
  const isMobile = useIsMobile();

  async function runAction(
    action: () => Promise<void>,
    loadingKey: string,
    successTitle: string
  ) {
    try {
      setLoading(loadingKey);
      setError(null);
      await action();
      await onRefresh();
      showToast({
        variant: "success",
        title: successTitle,
        description: item.obligation.title
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleMarkDone() {
    await runAction(async () => {
      await markObligationDone(item.obligationId, "Handled from Today Feed");
      await createFeedback({
        obligationId: item.obligationId,
        feedItemId: item.id,
        type: "COMPLETED",
        note: "Marked done from Today Feed"
      });
    }, "done", "Marked done");
  }

  async function handleDismiss() {
    await runAction(async () => {
      await dismissObligation(item.obligationId, "dont_show_again");
      await createFeedback({
        obligationId: item.obligationId,
        feedItemId: item.id,
        type: "DONT_SHOW_AGAIN",
        note: "Dismissed from Today Feed"
      });
    }, "dismiss", "Dismissed");
  }

  async function handlePostpone() {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await runAction(async () => {
      await postponeObligation(item.obligationId, until, "Postponed by 1 day from Today Feed");
      await createFeedback({
        obligationId: item.obligationId,
        feedItemId: item.id,
        type: "POSTPONED",
        note: "Postponed 1 day from Today Feed"
      });
    }, "postpone", "Postponed");
  }

  async function handleShowResolution() {
    try {
      setLoading("resolution");
      setError(null);

      const data = await getResolution(item.obligationId);
      setResolution(data);
      setShowResolution(true);

      await createFeedback({
        obligationId: item.obligationId,
        feedItemId: item.id,
        type: "ACCEPTED",
        note: "Opened resolution guidance"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load resolution";
      setError(message);
      showToast({ variant: "error", title: "Resolution failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <article style={cardStyles.item}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
            marginBottom: 12
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: 18 }}>{item.obligation.title}</h3>
            <div style={{ fontSize: 13, color: colors.textMuted }}>
              {item.obligation.type} · Due: {formatDateTime(item.obligation.dueDate)}
            </div>
          </div>

          <span style={{ ...getHookBadgeStyle(item.hookType), alignSelf: isMobile ? "flex-start" : "auto" }}>
            {item.hookType}
          </span>
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          <div>
            <strong>Why:</strong> {item.whyItMatters}
          </div>
          <div>
            <strong>What:</strong> {item.whatToDo}
          </div>
          <div>
            <strong>How hard:</strong> {item.howHardIsIt}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(140px, max-content))",
            gap: 10,
            marginBottom: 10
          }}
        >
          <button
            onClick={handleShowResolution}
            disabled={loading !== null}
            style={buttonStyles.primary}
          >
            {loading === "resolution" ? "Loading..." : item.primaryAction.label}
          </button>

          <Link href={`/obligations/${item.obligationId}`} style={buttonStyles.link}>
            View details
          </Link>

          <button
            onClick={handleMarkDone}
            disabled={loading !== null}
            style={buttonStyles.secondary}
          >
            {loading === "done" ? "Saving..." : "Mark done"}
          </button>

          <button
            onClick={handlePostpone}
            disabled={loading !== null}
            style={buttonStyles.secondary}
          >
            {loading === "postpone" ? "Saving..." : "Postpone 1 day"}
          </button>

          <button
            onClick={handleDismiss}
            disabled={loading !== null}
            style={buttonStyles.danger}
          >
            {loading === "dismiss" ? "Saving..." : "Dismiss"}
          </button>
        </div>

        {item.secondaryActions.length > 0 ? (
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
            Secondary actions: {item.secondaryActions.map((a) => a.label).join(", ")}
          </div>
        ) : null}

        {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      </article>

      <ResolutionModal
        open={showResolution}
        onClose={() => setShowResolution(false)}
        resolution={resolution}
      />
    </>
  );
}
