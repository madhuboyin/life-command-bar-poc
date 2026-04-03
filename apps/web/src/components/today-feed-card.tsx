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
import ResolutionModal from "./resolution-modal";

type Props = {
  item: TodayFeedItem;
  onRefresh: () => Promise<void>;
};

function formatDueDate(value?: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleString();
}

function badgeStyle(label: string) {
  const base = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: "#eef2ff",
    color: "#3730a3"
  } as const;

  if (label === "urgent") {
    return { ...base, background: "#fee2e2", color: "#991b1b" };
  }

  if (label === "money") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "quick_win") {
    return { ...base, background: "#fef3c7", color: "#92400e" };
  }

  return { ...base, background: "#e5e7eb", color: "#374151" };
}

export default function TodayFeedCard({ item, onRefresh }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionResponse | null>(null);
  const [showResolution, setShowResolution] = useState(false);

  async function runAction(action: () => Promise<void>, loadingKey: string) {
    try {
      setLoading(loadingKey);
      setError(null);
      await action();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
    }, "done");
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
    }, "dismiss");
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
    }, "postpone");
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
      setError(err instanceof Error ? err.message : "Could not load resolution");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <article
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 18,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 12
          }}
        >
          <div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: 18 }}>{item.obligation.title}</h3>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              {item.obligation.type} · Due: {formatDueDate(item.obligation.dueDate)}
            </div>
          </div>

          <span style={badgeStyle(item.hookType)}>{item.hookType}</span>
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

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          <button
            onClick={handleShowResolution}
            disabled={loading !== null}
            style={primaryButton}
          >
            {loading === "resolution" ? "Loading..." : item.primaryAction.label}
          </button>

          <Link href={`/obligations/${item.obligationId}`} style={linkButton}>
            View details
          </Link>

          <button
            onClick={handleMarkDone}
            disabled={loading !== null}
            style={secondaryButton}
          >
            {loading === "done" ? "Saving..." : "Mark done"}
          </button>

          <button
            onClick={handlePostpone}
            disabled={loading !== null}
            style={secondaryButton}
          >
            {loading === "postpone" ? "Saving..." : "Postpone 1 day"}
          </button>

          <button
            onClick={handleDismiss}
            disabled={loading !== null}
            style={dangerButton}
          >
            {loading === "dismiss" ? "Saving..." : "Dismiss"}
          </button>
        </div>

        {item.secondaryActions.length > 0 && (
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
            Secondary actions: {item.secondaryActions.map((a) => a.label).join(", ")}
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 10,
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: 14
            }}
          >
            {error}
          </div>
        )}
      </article>

      <ResolutionModal
        open={showResolution}
        onClose={() => setShowResolution(false)}
        resolution={resolution}
      />
    </>
  );
}

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const dangerButton: React.CSSProperties = {
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#b91c1c",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const linkButton: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center"
};
