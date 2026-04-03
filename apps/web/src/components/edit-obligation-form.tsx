"use client";

import { FormEvent, useState } from "react";
import { updateObligation } from "../lib/api";
import type { Obligation } from "../lib/types";
import { buttonStyles, inputStyles } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  obligation: Obligation;
  onSaved: (next: Obligation) => void;
};

export default function EditObligationForm({ obligation, onSaved }: Props) {
  const [form, setForm] = useState({
    type: obligation.type,
    title: obligation.title,
    description: obligation.description ?? "",
    vendor: obligation.vendor ?? "",
    amount: obligation.amount?.toString() ?? "",
    currency: obligation.currency ?? "USD",
    dueDate: obligation.dueDate ? obligation.dueDate.slice(0, 16) : "",
    recurrence: obligation.recurrence ?? "",
    effortLevel: obligation.effortLevel,
    impactLevel: obligation.impactLevel,
    status: obligation.status
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { showToast } = useToast();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const data = await updateObligation(obligation.id, {
        type: form.type,
        title: form.title,
        description: form.description || null,
        vendor: form.vendor || null,
        amount: form.amount ? Number(form.amount) : null,
        currency: form.currency || null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        recurrence: form.recurrence || null,
        effortLevel: form.effortLevel,
        impactLevel: form.impactLevel,
        status: form.status
      });

      onSaved(data.obligation);
      setSuccess("Obligation updated");
      showToast({
        variant: "success",
        title: "Obligation updated",
        description: form.title
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update obligation";
      setError(message);
      showToast({
        variant: "error",
        title: "Update failed",
        description: message
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={isMobile ? grid1 : grid2}>
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
            placeholder="Title"
            required
            style={inputStyles.input}
          />
        </div>

        <textarea
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Description"
          rows={4}
          style={inputStyles.textarea}
        />

        <div style={isMobile ? grid1 : grid2}>
          <input
            value={form.vendor}
            onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
            placeholder="Vendor"
            style={inputStyles.input}
          />

          <input
            value={form.recurrence}
            onChange={(e) => setForm((prev) => ({ ...prev, recurrence: e.target.value }))}
            placeholder="Recurrence"
            style={inputStyles.input}
          />
        </div>

        <div style={isMobile ? grid1 : grid3}>
          <input
            type="number"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
            placeholder="Amount"
            style={inputStyles.input}
          />

          <input
            value={form.currency}
            onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
            placeholder="Currency"
            style={inputStyles.input}
          />

          <input
            type="datetime-local"
            value={form.dueDate}
            onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
            style={inputStyles.input}
          />
        </div>

        <div style={isMobile ? grid1 : grid3}>
          <select
            value={form.effortLevel}
            onChange={(e) => setForm((prev) => ({ ...prev, effortLevel: e.target.value as Obligation["effortLevel"] }))}
            style={inputStyles.input}
          >
            <option value="LOW">Effort: Low</option>
            <option value="MEDIUM">Effort: Medium</option>
            <option value="HIGH">Effort: High</option>
          </select>

          <select
            value={form.impactLevel}
            onChange={(e) => setForm((prev) => ({ ...prev, impactLevel: e.target.value as Obligation["impactLevel"] }))}
            style={inputStyles.input}
          >
            <option value="LOW">Impact: Low</option>
            <option value="MEDIUM">Impact: Medium</option>
            <option value="HIGH">Impact: High</option>
          </select>

          <select
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as Obligation["status"] }))}
            style={inputStyles.input}
          >
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="POSTPONED">Postponed</option>
            <option value="RESOLVED">Resolved</option>
            <option value="IGNORED">Ignored</option>
          </select>
        </div>

        <div>
          <button type="submit" disabled={loading} style={buttonStyles.primary}>
            {loading ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      {success ? <StatusMessage variant="success">{success}</StatusMessage> : null}
    </form>
  );
}

const grid1: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12
};

const grid3: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 12
};
