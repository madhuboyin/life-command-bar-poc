"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createFeedback,
  dismissObligation,
  getResolution,
  markObligationDone,
  postponeObligation
} from "../lib/api";
import type { Obligation, ResolutionResponse } from "../lib/types";
import ResolutionModal from "./resolution-modal";
import {
  buttonStyles,
  cardStyles,
  colors,
  formatDateTime,
  pageStyles,
  text
} from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  obligation: Obligation;
};

export default function ObligationDetailClient({ obligation }: Props) {
  const [current, setCurrent] = useState(obligation);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionResponse | null>(null);
  const [showResolution, setShowResolution] = useState(false);
  const isMobile = useIsMobile();
  const { showToast } = useToast();

  async function handleMarkDone() {
    try {
      setLoading("done");
      setError(null);
      const data = await markObligationDone(current.id, "Handled from detail page");
      await createFeedback({
        obligationId: current.id,
        type: "COMPLETED",
        note: "Marked done from detail page"
      });
      setCurrent(data.obligation);
      showToast({ variant: "success", title: "Marked done", description: current.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mark done";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleDismiss() {
    try {
      setLoading("dismiss");
      setError(null);
      const data = await dismissObligation(current.id, "dont_show_again");
      await createFeedback({
        obligationId: current.id,
        type: "DONT_SHOW_AGAIN",
        note: "Dismissed from detail page"
      });
      setCurrent(data.obligation);
      showToast({ variant: "success", title: "Dismissed", description: current.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dismiss";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handlePostpone() {
    try {
      setLoading("postpone");
      setError(null);
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const data = await postponeObligation(current.id, until, "Postponed 1 day from detail page");
      await createFeedback({
        obligationId: current.id,
        type: "POSTPONED",
        note: "Postponed 1 day from detail page"
      });
      setCurrent(data.obligation);
      showToast({ variant: "success", title: "Postponed", description: current.title });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to postpone";
      setError(message);
      showToast({ variant: "error", title: "Action failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleShowResolution() {
    try {
      setLoading("resolution");
      setError(null);
      const data = await getResolution(current.id);
      await createFeedback({
        obligationId: current.id,
        type: "ACCEPTED",
        note: "Opened resolution from detail page"
      });
      setResolution(data);
      setShowResolution(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load resolution";
      setError(message);
      showToast({ variant: "error", title: "Resolution failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <main style={isMobile ? pageStyles.shellMobile : pageStyles.shell}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/obligations" style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to Obligations
          </Link>
        </div>

        <section style={cardStyles.section}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: isMobile ? "stretch" : "flex-start",
              flexDirection: isMobile ? "column" : "row",
              gap: 20,
              marginBottom: 20
            }}
          >
            <div>
              <h1 style={isMobile ? text.pageTitleMobile : text.pageTitle}>{current.title}</h1>
              <div style={{ color: colors.textMuted }}>
                {current.type} · {current.status}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(140px, max-content))",
                gap: 10
              }}
            >
              <button onClick={handleShowResolution} disabled={loading !== null} style={buttonStyles.primary}>
                {loading === "resolution" ? "Loading..." : "Open resolution"}
              </button>

              <button onClick={handleMarkDone} disabled={loading !== null} style={buttonStyles.secondary}>
                {loading === "done" ? "Saving..." : "Mark done"}
              </button>

              <button onClick={handlePostpone} disabled={loading !== null} style={buttonStyles.secondary}>
                {loading === "postpone" ? "Saving..." : "Postpone 1 day"}
              </button>

              <button onClick={handleDismiss} disabled={loading !== null} style={buttonStyles.danger}>
                {loading === "dismiss" ? "Saving..." : "Dismiss"}
              </button>
            </div>
          </div>

          {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

          <div style={{ display: "grid", gap: 14 }}>
            <section style={cardStyles.bordered}>
              <div style={text.label}>Overview</div>
              <div><strong>Vendor:</strong> {current.vendor ?? "—"}</div>
              <div><strong>Description:</strong> {current.description ?? "—"}</div>
              <div><strong>Due Date:</strong> {formatDateTime(current.dueDate)}</div>
              <div><strong>Amount:</strong> {current.amount ?? "—"} {current.currency ?? ""}</div>
              <div><strong>Source:</strong> {current.source}</div>
            </section>

            <section style={cardStyles.bordered}>
              <div style={text.label}>Ranking Signals</div>
              <div><strong>Confidence:</strong> {current.confidenceScore}</div>
              <div><strong>Urgency:</strong> {current.urgencyScore}</div>
              <div><strong>Importance:</strong> {current.importanceScore}</div>
              <div><strong>Effort:</strong> {current.effortLevel}</div>
              <div><strong>Impact:</strong> {current.impactLevel}</div>
            </section>

            <section style={cardStyles.bordered}>
              <div style={text.label}>Timestamps</div>
              <div><strong>Created:</strong> {new Date(current.createdAt).toLocaleString()}</div>
              <div><strong>Updated:</strong> {new Date(current.updatedAt).toLocaleString()}</div>
              <div><strong>Last shown:</strong> {current.lastShownAt ? new Date(current.lastShownAt).toLocaleString() : "—"}</div>
              <div><strong>Last acted:</strong> {current.lastActedAt ? new Date(current.lastActedAt).toLocaleString() : "—"}</div>
            </section>
          </div>
        </section>
      </main>

      <ResolutionModal
        open={showResolution}
        onClose={() => setShowResolution(false)}
        resolution={resolution}
      />
    </>
  );
}
