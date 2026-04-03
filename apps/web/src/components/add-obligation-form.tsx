"use client";

import { FormEvent, useState } from "react";
import { createObligation } from "../lib/api";

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
      setError(err instanceof Error ? err.message : "Failed to create obligation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        marginBottom: 24
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>Add Obligation</h2>
        <p style={{ margin: "6px 0 0 0", color: "#6b7280" }}>
          Manually seed obligations for the Today Feed
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={grid2}>
            <select
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
              style={inputStyle}
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
              style={inputStyle}
            />
          </div>

          <div style={grid2}>
            <input
              value={form.vendor}
              onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
              placeholder="Vendor (optional)"
              style={inputStyle}
            />

            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount (optional)"
              style={inputStyle}
            />
          </div>

          <div style={grid3}>
            <input
              type="datetime-local"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              style={inputStyle}
            />

            <select
              value={form.effortLevel}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, effortLevel: e.target.value }))
              }
              style={inputStyle}
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
              style={inputStyle}
            >
              <option value="LOW">Impact: Low</option>
              <option value="MEDIUM">Impact: Medium</option>
              <option value="HIGH">Impact: High</option>
            </select>
          </div>

          <div>
            <button type="submit" disabled={loading} style={primaryButton}>
              {loading ? "Creating..." : "Create obligation"}
            </button>
          </div>
        </div>
      </form>

      {error && <div style={errorBox}>{error}</div>}
      {success && <div style={successBox}>{success}</div>}
    </section>
  );
}

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

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box"
};

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 10,
  padding: "12px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: 10,
  borderRadius: 10,
  background: "#fef2f2",
  color: "#991b1b"
};

const successBox: React.CSSProperties = {
  marginTop: 14,
  padding: 10,
  borderRadius: 10,
  background: "#ecfdf5",
  color: "#166534"
};
