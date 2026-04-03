"use client";

import { FormEvent, useState } from "react";
import { createObligation } from "../lib/api";
import { buttonStyles, inputStyles } from "../lib/ui";
import { useIsMobile } from "../lib/use-is-mobile";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  onCreated: () => Promise<void>;
};

export default function AddObligationForm({ onCreated }: Props) {
  const [form, setForm] = useState({
    type: "BILL",
    title: "",
    vendor: "",
    amount: "",
    dueDate: "",
    effortLevel: "MEDIUM",
    impactLevel: "MEDIUM"
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

      await createObligation({
        type: form.type as "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT",
        title: form.title,
        vendor: form.vendor || undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
        source: "MANUAL",
        effortLevel: form.effortLevel as "LOW" | "MEDIUM" | "HIGH",
        impactLevel: form.impactLevel as "LOW" | "MEDIUM" | "HIGH",
        status: "ACTIVE"
      });

      setSuccess("Obligation created");
      showToast({
        variant: "success",
        title: "Obligation created",
        description: form.title
      });

      setForm({
        type: "BILL",
        title: "",
        vendor: "",
        amount: "",
        dueDate: "",
        effortLevel: "MEDIUM",
        impactLevel: "MEDIUM"
      });

      await onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create obligation";
      setError(message);
      showToast({ variant: "error", title: "Create failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title="Add Obligation"
      description="Manually seed obligations for the Today Feed"
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={isMobile ? grid1 : grid2}>
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
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

          <div style={isMobile ? grid1 : grid2}>
            <input
              value={form.vendor}
              onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
              placeholder="Vendor (optional)"
              style={inputStyles.input}
            />

            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount (optional)"
              style={inputStyles.input}
            />
          </div>

          <div style={isMobile ? grid1 : grid3}>
            <input
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              style={inputStyles.input}
            />

            <select
              value={form.effortLevel}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, effortLevel: e.target.value }))
              }
              style={inputStyles.input}
            >
              <option value="LOW">Effort: Low</option>
              <option value="MEDIUM">Effort: Medium</option>
              <option value="HIGH">Effort: High</option>
            </select>

            <select
              value={form.impactLevel}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, impactLevel: e.target.value }))
              }
              style={inputStyles.input}
            >
              <option value="LOW">Impact: Low</option>
              <option value="MEDIUM">Impact: Medium</option>
              <option value="HIGH">Impact: High</option>
            </select>
          </div>

          <div>
            <button type="submit" disabled={loading} style={buttonStyles.primary}>
              {loading ? "Creating..." : "Create obligation"}
            </button>
          </div>
        </div>
      </form>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
      {success ? <StatusMessage variant="success">{success}</StatusMessage> : null}
    </SectionCard>
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
