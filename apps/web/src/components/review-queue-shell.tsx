"use client";

import Link from "next/link";
import { useState } from "react";
import { getReviewQueue } from "../lib/api";
import type { ReviewQueueResponse } from "../lib/types";
import { buttonStyles, pageStyles } from "../lib/ui";
import { buildEmptyStateMessage } from "../lib/human-language.service";
import { buildPrimaryReassurance } from "../lib/emotional-trust.service";
import ReviewQueueCard from "./review-queue-card";
import EmptyState from "./ui/empty-state";
import StatusMessage from "./ui/status-message";

type Props = {
  initialData: ReviewQueueResponse;
  initialError?: string | null;
};

export default function ReviewQueueShell({ initialData, initialError = null }: Props) {
  const emptyMessage = buildEmptyStateMessage("review");
  const reassurance = buildPrimaryReassurance({
    emotionalState: "REVIEW_NEEDED"
  });
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);
      const next = await getReviewQueue({ limit: 100 });
      setData(next);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not load review queue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>

      <header style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: "0 0 6px 0", fontSize: 30 }}>Needs Review</h1>
          <p style={{ margin: 0, color: "#6b7280" }}>
            {reassurance.supporting ?? "Items that need a quick confirmation."}
          </p>
        </div>
        <button onClick={refresh} style={buttonStyles.secondary} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {data.items.length === 0 ? (
        <EmptyState
          title={emptyMessage.primary}
          description={emptyMessage.context ?? "No unresolved items need review right now."}
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {data.items.map((item) => (
            <ReviewQueueCard key={item.id} item={item} onUpdated={refresh} />
          ))}
        </div>
      )}
    </main>
  );
}
