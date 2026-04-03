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

type Props = {
  obligation: Obligation;
};

function formatDueDate(value?: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleString();
}

export default function ObligationDetailClient({ obligation }: Props) {
  const [current, setCurrent] = useState(obligation);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionResponse | null>(null);
  const [showResolution, setShowResolution] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark done");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to postpone");
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
      setError(err instanceof Error ? err.message : "Failed to load resolution");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <main style={{ maxWidth: 980, margin: "40px auto", padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/obligations" style={{ color: "#2563eb", textDecoration: "none" }}>
            ← Back to Obligations
          </Link>
        </div>

        <section
          style={{
            background: "#fff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 20,
              marginBottom: 20
            }}
          >
            <div>
              <h1 style={{ margin: "0 0 8px 0" }}>{current.title}</h1>
              <div style={{ color: "#6b7280" }}>
                {current.type} · {current.status}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={handleShowResolution} disabled={loading !== null} style={primaryButton}>
                {loading === "resolution" ? "Loading..." : "Open resolution"}
              </button>

              <button onClick={handleMarkDone} disabled={loading !== null} style={secondaryButton}>
                {loading === "done" ? "Saving..." : "Mark done"}
              </button>

              <button onClick={handlePostpone} disabled={loading !== null} style={secondaryButton}>
                {loading === "postpone" ? "Saving..." : "Postpone 1 day"}
              </button>

              <button onClick={handleDismiss} disabled={loading !== null} style={dangerButton}>
                {loading === "dismiss" ? "Saving..." : "Dismiss"}
              </button>
            </div>
          </div>

          {error && (
            <div style={errorBox}>
              {error}
            </div>
          )}

          <div style={{ display: "grid", gap: 14 }}>
            <section style={sectionStyle}>
              <div style={labelStyle}>Overview</div>
              <div><strong>Vendor:</strong> {current.vendor ?? "—"}</div>
              <div><strong>Description:</strong> {current.description ?? "—"}</div>
              <div><strong>Due Date:</strong> {formatDueDate(current.dueDate)}</div>
              <div><strong>Amount:</strong> {current.amount ?? "—"} {current.currency ?? ""}</div>
              <div><strong>Source:</strong> {current.source}</div>
            </section>

            <section style={sectionStyle}>
              <div style={labelStyle}>Ranking Signals</div>
              <div><strong>Confidence:</strong> {current.confidenceScore}</div>
              <div><strong>Urgency:</strong> {current.urgencyScore}</div>
              <div><strong>Importance:</strong> {current.importanceScore}</div>
              <div><strong>Effort:</strong> {current.effortLevel}</div>
              <div><strong>Impact:</strong> {current.impactLevel}</div>
            </section>

            <section style={sectionStyle}>
              <div style={labelStyle}>Timestamps</div>
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

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#fafafa"
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  marginBottom: 8
};

const errorBox: React.CSSProperties = {
  marginBottom: 14,
  padding: 10,
  borderRadius: 10,
  background: "#fef2f2",
  color: "#991b1b"
};
