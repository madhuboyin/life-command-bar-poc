"use client";

import { FormEvent, useEffect, useState } from "react";
import { createReminder, getReminders } from "../lib/api";
import type { Reminder } from "../lib/types";

export default function RemindersPanel() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    scheduledFor: ""
  });

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await getReminders();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reminders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    try {
      setCreating(true);
      setError(null);

      await createReminder({
        title: form.title,
        scheduledFor: new Date(form.scheduledFor).toISOString()
      });

      setForm({
        title: "",
        scheduledFor: ""
      });

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create reminder");
    } finally {
      setCreating(false);
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
        <h2 style={{ margin: 0 }}>Reminders</h2>
        <p style={{ color: "#6b7280", marginTop: 6 }}>
          Internal reminders created from obligations or manually.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <input
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Reminder title"
          required
          style={inputStyle}
        />
        <input
          type="datetime-local"
          value={form.scheduledFor}
          onChange={(e) => setForm((prev) => ({ ...prev, scheduledFor: e.target.value }))}
          required
          style={inputStyle}
        />
        <div>
          <button type="submit" disabled={creating} style={primaryButton}>
            {creating ? "Creating..." : "Create reminder"}
          </button>
        </div>
      </form>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: "grid", gap: 10 }}>
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading reminders...</div>
        ) : items.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No reminders yet.</div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 14,
                background: "#fafafa"
              }}
            >
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                Scheduled for: {new Date(item.scheduledFor).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                Status: {item.status}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 14
};

const primaryButton: React.CSSProperties = {
  border: "none",
  background: "#111827",
  color: "#fff",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};

const errorBox: React.CSSProperties = {
  marginBottom: 14,
  padding: 10,
  borderRadius: 10,
  background: "#fef2f2",
  color: "#991b1b"
};
