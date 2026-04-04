"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmObligationCandidate,
  rejectObligationCandidate,
  updateObligation
} from "../lib/api";
import type { Obligation, ObligationSourceDetails } from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles } from "../lib/ui";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";
import SourceBadge from "./source-badge";
import ConfidenceBadge from "./confidence-badge";

type Props = {
  obligation: Obligation;
  source: ObligationSourceDetails | null;
};

export default function ObligationCandidateReview({ obligation, source }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    type: obligation.type,
    title: obligation.title,
    vendor: obligation.vendor ?? "",
    amount: obligation.amount !== null && obligation.amount !== undefined ? String(obligation.amount) : "",
    currency: obligation.currency ?? "USD",
    dueDate: obligation.dueDate ? obligation.dueDate.slice(0, 16) : "",
    recurrence: obligation.recurrence ?? "",
    description: obligation.description ?? ""
  });
  const [loading, setLoading] = useState<"activate" | "draft" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    try {
      setLoading("activate");
      setError(null);

      await confirmObligationCandidate(obligation.id, {
        type: form.type,
        title: form.title,
        vendor: form.vendor || null,
        amount: form.amount ? Number(form.amount) : null,
        currency: form.currency || null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        recurrence: form.recurrence || null,
        description: form.description || null,
        status: "ACTIVE"
      });

      showToast({
        variant: "success",
        title: "Candidate activated",
        description: form.title
      });

      router.push(`/obligations/${obligation.id}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not activate candidate";
      setError(message);
      showToast({ variant: "error", title: "Activation failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleSaveDraft() {
    try {
      setLoading("draft");
      setError(null);

      await updateObligation(obligation.id, {
        type: form.type,
        title: form.title,
        vendor: form.vendor || null,
        amount: form.amount ? Number(form.amount) : null,
        currency: form.currency || null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        recurrence: form.recurrence || null,
        description: form.description || null,
        status: "DRAFT"
      });

      showToast({
        variant: "success",
        title: "Draft saved",
        description: form.title
      });

      router.push(`/obligations/${obligation.id}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save draft";
      setError(message);
      showToast({ variant: "error", title: "Save failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    try {
      setLoading("reject");
      setError(null);
      await rejectObligationCandidate(obligation.id, "Rejected from candidate review");

      showToast({
        variant: "success",
        title: "Candidate rejected",
        description: form.title
      });

      router.push("/obligations");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not reject candidate";
      setError(message);
      showToast({ variant: "error", title: "Reject failed", description: message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Source Provenance</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <SourceBadge sourceType={obligation.sourceType} />
          <ConfidenceBadge
            confidenceBand={obligation.confidenceBand}
            needsReview={obligation.needsReview}
          />
        </div>
        <div style={{ fontSize: 14, color: colors.textMuted }}>
          {source?.provenanceLabel ?? "Imported source"}
        </div>
        <div style={{ fontSize: 14, marginTop: 6 }}>
          Parse status: <strong>{source?.parseStatus ?? "UNKNOWN"}</strong>
        </div>
        <div style={{ fontSize: 14 }}>
          Parse confidence: <strong>{source?.parseConfidence !== null && source?.parseConfidence !== undefined ? `${Math.round(source.parseConfidence * 100)}%` : "—"}</strong>
        </div>
      </section>

      <section style={cardStyles.bordered}>
        <h3 style={{ marginTop: 0 }}>Review Candidate</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as Obligation["type"] }))}
              style={inputStyles.input}
            >
              <option value="BILL">Bill</option>
              <option value="SUBSCRIPTION">Subscription</option>
              <option value="RENEWAL">Renewal</option>
              <option value="COMMITMENT">Commitment</option>
            </select>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              style={inputStyles.input}
              placeholder="Title"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input
              value={form.vendor}
              onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
              style={inputStyles.input}
              placeholder="Vendor"
            />
            <input
              value={form.recurrence}
              onChange={(e) => setForm((prev) => ({ ...prev, recurrence: e.target.value }))}
              style={inputStyles.input}
              placeholder="Recurrence"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              style={inputStyles.input}
              placeholder="Amount"
            />
            <input
              value={form.currency}
              onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))}
              style={inputStyles.input}
              placeholder="Currency"
            />
            <input
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              style={inputStyles.input}
            />
          </div>

          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            style={inputStyles.textarea}
            placeholder="Description"
          />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={handleActivate}
              disabled={loading !== null}
              style={buttonStyles.primary}
              type="button"
            >
              {loading === "activate" ? "Activating..." : "Activate"}
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={loading !== null}
              style={buttonStyles.secondary}
              type="button"
            >
              {loading === "draft" ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={handleReject}
              disabled={loading !== null}
              style={buttonStyles.danger}
              type="button"
            >
              {loading === "reject" ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </div>
      </section>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
    </div>
  );
}
