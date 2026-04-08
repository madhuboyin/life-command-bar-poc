"use client";

import Link from "next/link";
import { useState } from "react";
import { getSubscriptionReviewHub } from "../lib/api";
import type { SubscriptionReviewHubResponse } from "../lib/types";
import { buttonStyles, pageStyles } from "../lib/ui";
import SubscriptionReviewEmptyState from "./subscription-review-empty-state";
import SubscriptionReviewGroup from "./subscription-review-group";
import SubscriptionReviewSummary from "./subscription-review-summary";
import StatusMessage from "./ui/status-message";

export default function SubscriptionReviewHubShell({
  initialData,
  initialError = null
}: {
  initialData: SubscriptionReviewHubResponse | null;
  initialError?: string | null;
}) {
  const [data, setData] = useState<SubscriptionReviewHubResponse | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const next = await getSubscriptionReviewHub();
      setData(next);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh subscription review hub"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/subscriptions" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to subscriptions
        </Link>
      </div>

      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: "0 0 6px 0", fontSize: 32 }}>Subscription Review Hub</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            High-priority renewals and pricing changes. One decision at a time.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} style={buttonStyles.secondary} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {data ? (
        <div style={{ display: "grid", gap: 12 }}>
          <SubscriptionReviewSummary summary={data.summary} />
          {data.groups.length === 0 ? (
            <SubscriptionReviewEmptyState />
          ) : (
            data.groups.map((group) => <SubscriptionReviewGroup key={group.key} group={group} />)
          )}
        </div>
      ) : (
        <SubscriptionReviewEmptyState />
      )}
    </main>
  );
}
