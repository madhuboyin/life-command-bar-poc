"use client";

import { useState } from "react";
import { correctObligation } from "../lib/api";
import type { Obligation } from "../lib/types";
import { buttonStyles, cardStyles, inputStyles } from "../lib/ui";
import StatusMessage from "./ui/status-message";
import { useToast } from "./ui/toast-provider";

type Props = {
  obligation: Obligation;
  onCorrected: (next: Obligation) => void;
};

export default function CorrectionPanel({ obligation, onCorrected }: Props) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [dontShowSimilar, setDontShowSimilar] = useState(false);
  const [dismissPermanently, setDismissPermanently] = useState(false);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [fields, setFields] = useState({
    title: obligation.title,
    vendor: obligation.vendor ?? "",
    amount:
      obligation.amount !== null && obligation.amount !== undefined
        ? String(obligation.amount)
        : "",
    dueDate: obligation.dueDate ? obligation.dueDate.slice(0, 16) : ""
  });

  async function handleSubmit() {
    try {
      setLoading(true);
      setError(null);

      const correctedFields = showFieldEditor
        ? {
            title: fields.title || undefined,
            vendor: fields.vendor ? fields.vendor : null,
            amount: fields.amount ? Number(fields.amount) : null,
            dueDate: fields.dueDate ? new Date(fields.dueDate).toISOString() : null
          }
        : undefined;

      const result = await correctObligation(obligation.id, {
        correctedFields,
        reason: reason || undefined,
        dontShowSimilar,
        dismissPermanently
      });

      onCorrected(result.obligation);
      showToast({
        variant: "success",
        title: "Correction saved",
        description: "Thanks - this helps keep recommendations reliable."
      });
      setReason("");
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Could not save correction";
      setError(message);
      showToast({ variant: "error", title: "Correction failed", description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={cardStyles.bordered}>
      <h3 style={{ marginTop: 0 }}>Fix This Quickly</h3>
      <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
        If this is wrong, update it here and we will use your correction going forward.
      </p>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          placeholder="What looks wrong?"
          style={inputStyles.textarea}
        />

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={showFieldEditor}
            onChange={(event) => setShowFieldEditor(event.target.checked)}
          />
          Edit key fields
        </label>

        {showFieldEditor ? (
          <div style={{ display: "grid", gap: 8 }}>
            <input
              value={fields.title}
              onChange={(event) =>
                setFields((previous) => ({ ...previous, title: event.target.value }))
              }
              placeholder="Title"
              style={inputStyles.input}
            />
            <input
              value={fields.vendor}
              onChange={(event) =>
                setFields((previous) => ({ ...previous, vendor: event.target.value }))
              }
              placeholder="Vendor"
              style={inputStyles.input}
            />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
              <input
                type="number"
                value={fields.amount}
                onChange={(event) =>
                  setFields((previous) => ({ ...previous, amount: event.target.value }))
                }
                placeholder="Amount"
                style={inputStyles.input}
              />
              <input
                type="datetime-local"
                value={fields.dueDate}
                onChange={(event) =>
                  setFields((previous) => ({ ...previous, dueDate: event.target.value }))
                }
                style={inputStyles.input}
              />
            </div>
          </div>
        ) : null}

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={dismissPermanently}
            onChange={(event) => setDismissPermanently(event.target.checked)}
          />
          Dismiss permanently
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={dontShowSimilar}
            onChange={(event) => setDontShowSimilar(event.target.checked)}
          />
          Don&apos;t show similar
        </label>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        style={buttonStyles.secondary}
      >
        {loading ? "Saving..." : "Save correction"}
      </button>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
    </section>
  );
}
