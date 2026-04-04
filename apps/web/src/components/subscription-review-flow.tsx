"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applySubscriptionDecision,
  getSubscriptionReviewFlow
} from "../lib/api";
import type { SubscriptionGuidedFlow } from "../lib/types";
import { buttonStyles, cardStyles, colors, inputStyles, radius } from "../lib/ui";

type Decision = "KEEP" | "CANCEL" | "DOWNGRADE" | "REVIEW" | "REMIND_LATER";

export default function SubscriptionReviewFlow({
  subscriptionId
}: {
  subscriptionId: string;
}) {
  const [flow, setFlow] = useState<SubscriptionGuidedFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState("");
  const [remindAt, setRemindAt] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getSubscriptionReviewFlow(subscriptionId);
        if (!active) return;
        setFlow(data.flow);
        setDecision(toDecision(data.flow.recommendedDecision));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load review flow");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [subscriptionId]);

  const decisionOptions = useMemo(() => {
    if (!flow) return [];
    const lastStep = flow.steps.find((step) => step.key === "decision");
    return lastStep?.options ?? [];
  }, [flow]);

  async function submitDecision() {
    if (!decision) return;
    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);
      await applySubscriptionDecision(subscriptionId, {
        decision,
        remindAt: decision === "REMIND_LATER" && remindAt ? toIsoOrNull(remindAt) : undefined,
        note: note.trim() ? note.trim() : undefined
      });
      setMessage("Decision applied. Subscription optimization has been updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not apply decision");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <section style={{ ...cardStyles.section }}>Loading subscription review flow...</section>;
  }

  if (!flow) {
    return (
      <section style={{ ...cardStyles.section, color: colors.errorText }}>
        {error ?? "Could not load subscription review flow."}
      </section>
    );
  }

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 12 }}>
      <header>
        <h2 style={{ margin: 0 }}>Subscription Review Flow</h2>
        <p style={{ margin: "6px 0 0 0", color: colors.textMuted }}>{flow.title}</p>
      </header>

      <div style={{ display: "grid", gap: 10 }}>
        {flow.steps.map((step) => (
          <article key={step.key} style={{ ...cardStyles.item, display: "grid", gap: 8 }}>
            <strong>{step.title}</strong>
            <div style={{ color: colors.textMuted, fontSize: 14 }}>{step.description}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {step.options.map((option) => (
                <span
                  key={`${step.key}_${option.key}`}
                  style={{
                    borderRadius: radius.pill,
                    border: `1px solid ${option.recommended ? "#10b981" : colors.border}`,
                    background: option.recommended ? "#ecfdf5" : colors.surface,
                    color: option.recommended ? "#047857" : colors.textMuted,
                    padding: "4px 10px",
                    fontSize: 12
                  }}
                >
                  {option.label}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
        <strong>Decision</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {decisionOptions.map((option) => {
            const optionDecision = toDecision(option.key);
            if (!optionDecision) return null;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setDecision(optionDecision)}
                style={{
                  ...buttonStyles.secondary,
                  borderColor: decision === optionDecision ? "#2563eb" : "#d1d5db",
                  color: decision === optionDecision ? "#1d4ed8" : "#111827",
                  background: decision === optionDecision ? "#eff6ff" : "#ffffff"
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {decision === "REMIND_LATER" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: colors.textMuted }}>Remind at</span>
            <input
              type="date"
              value={remindAt}
              onChange={(event) => setRemindAt(event.target.value)}
              style={inputStyles.input}
            />
          </label>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, color: colors.textMuted }}>Note (optional)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            style={inputStyles.textarea}
          />
        </label>

        <div>
          <button
            type="button"
            disabled={submitting || !decision}
            onClick={() => void submitDecision()}
            style={buttonStyles.primary}
          >
            {submitting ? "Applying..." : "Apply decision"}
          </button>
        </div>
      </div>

      {error ? <div style={{ color: colors.errorText, fontSize: 13 }}>{error}</div> : null}
      {message ? <div style={{ color: colors.successText, fontSize: 13 }}>{message}</div> : null}
    </section>
  );
}

function toDecision(
  value: string
): "KEEP" | "CANCEL" | "DOWNGRADE" | "REVIEW" | "REMIND_LATER" | null {
  if (value === "KEEP") return "KEEP";
  if (value === "CANCEL") return "CANCEL";
  if (value === "DOWNGRADE") return "DOWNGRADE";
  if (value === "REVIEW") return "REVIEW";
  if (value === "REMIND_LATER") return "REMIND_LATER";
  if (value === "CONFIRM") return "REVIEW";
  if (value === "IGNORE") return "KEEP";
  return null;
}

function toIsoOrNull(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

