"use client";

import { FormEvent, useEffect, useState } from "react";
import { createReminder, getReminders } from "../lib/api";
import type { Reminder } from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles } from "../lib/ui";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";
import LoadingCard from "./ui/loading-card";
import EmptyState from "./ui/empty-state";

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
    <SectionCard
      title="Reminders"
      description="Internal reminders created from obligations or manually"
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, marginBottom: 18 }}>
        <input
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Reminder title"
          required
          style={inputStyles.input}
        />
        <input
          type="datetime-local"
          value={form.scheduledFor}
          onChange={(e) => setForm((prev) => ({ ...prev, scheduledFor: e.target.value }))}
          required
          style={inputStyles.input}
        />
        <div>
          <button type="submit" disabled={creating} style={buttonStyles.primary}>
            {creating ? "Creating..." : "Create reminder"}
          </button>
        </div>
      </form>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      <div style={{ display: "grid", gap: 10 }}>
        {loading ? (
          <>
            <LoadingCard title="Loading reminders..." lines={2} />
            <LoadingCard title="Loading reminders..." lines={2} />
          </>
        ) : items.length === 0 ? (
          <EmptyState
            title="No reminders yet"
            description="Create a reminder to keep obligations from slipping."
          />
        ) : (
          items.map((item) => (
            <article key={item.id} style={cardStyles.bordered}>
              <div style={{ fontWeight: 600 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: colors.textMuted, marginTop: 4 }}>
                Scheduled for: {new Date(item.scheduledFor).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                Status: {item.status}
              </div>
            </article>
          ))
        )}
      </div>
    </SectionCard>
  );
}
