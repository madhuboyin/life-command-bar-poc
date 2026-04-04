"use client";

import { useState } from "react";
import { mergeSubscriptions } from "../lib/api";
import { buttonStyles, cardStyles, colors, inputStyles } from "../lib/ui";

export default function SubscriptionMergePanel({
  primarySubscriptionId
}: {
  primarySubscriptionId: string;
}) {
  const [duplicateId, setDuplicateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleMerge() {
    if (!duplicateId.trim()) {
      setError("Enter a duplicate subscription id to merge.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      await mergeSubscriptions({
        primarySubscriptionId,
        duplicateSubscriptionId: duplicateId.trim()
      });

      setMessage("Merge completed. Refresh to see updated evidence and history.");
      setDuplicateId("");
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : "Could not merge subscriptions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0 }}>Merge Duplicate Subscription</h2>
      <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>
        Move evidence, lifecycle history, and linked obligations from a duplicate record into this canonical subscription.
      </p>
      <input
        value={duplicateId}
        onChange={(event) => setDuplicateId(event.target.value)}
        placeholder="Duplicate subscription id"
        style={inputStyles.input}
      />
      <div>
        <button type="button" onClick={() => void handleMerge()} disabled={loading} style={buttonStyles.secondary}>
          {loading ? "Merging..." : "Merge into this subscription"}
        </button>
      </div>
      {error ? <div style={{ color: colors.errorText, fontSize: 13 }}>{error}</div> : null}
      {message ? <div style={{ color: colors.successText, fontSize: 13 }}>{message}</div> : null}
    </section>
  );
}
