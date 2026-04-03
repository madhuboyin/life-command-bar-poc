"use client";

import { useCallback, useEffect, useState } from "react";
import { getTodayFeed } from "../lib/api";
import type { TodayFeedResponse } from "../lib/types";
import { buttonStyles } from "../lib/ui";
import TodayFeedCard from "./today-feed-card";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";
import LoadingCard from "./ui/loading-card";
import EmptyState from "./ui/empty-state";

type Props = {
  initialData: TodayFeedResponse;
  externalItems?: TodayFeedResponse["items"] | null;
  initialError?: string | null;
  onRefreshComplete?: (next: TodayFeedResponse) => void;
};

export default function TodayFeedClient({
  initialData,
  externalItems,
  initialError = null,
  onRefreshComplete
}: Props) {
  const [data, setData] = useState<TodayFeedResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await getTodayFeed();
      setData(next);
      onRefreshComplete?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh feed");
    } finally {
      setLoading(false);
    }
  }, [onRefreshComplete]);

  useEffect(() => {
    setData(initialData);
    setError(initialError);
  }, [initialData, initialError]);

  useEffect(() => {
    if (externalItems) {
      const next = {
        generatedAt: new Date().toISOString(),
        items: externalItems
      };
      setData(next);
    }
  }, [externalItems]);

  return (
    <SectionCard
      title="Today Feed"
      description="Focused list of what is most worth handling now"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 16
        }}
      >
        <button onClick={refresh} disabled={loading} style={buttonStyles.secondary}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}

      {loading ? (
        <div style={{ display: "grid", gap: 16 }}>
          <LoadingCard title="Refreshing Today Feed..." lines={3} />
          <LoadingCard title="Refreshing Today Feed..." lines={3} />
          <LoadingCard title="Refreshing Today Feed..." lines={3} />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          title="No items in Today Feed"
          description="Add or import obligations to start building your daily feed."
        />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {data.items.map((item) => (
            <TodayFeedCard key={item.id} item={item} onRefresh={refresh} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
