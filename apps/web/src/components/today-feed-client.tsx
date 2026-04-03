"use client";

import { useCallback, useEffect, useState } from "react";
import { getTodayFeed } from "../lib/api";
import type { TodayFeedResponse } from "../lib/types";
import { buttonStyles, colors } from "../lib/ui";
import TodayFeedCard from "./today-feed-card";
import SectionCard from "./ui/section-card";
import StatusMessage from "./ui/status-message";

type Props = {
  initialData: TodayFeedResponse;
  externalItems?: TodayFeedResponse["items"] | null;
};

export default function TodayFeedClient({ initialData, externalItems }: Props) {
  const [data, setData] = useState<TodayFeedResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const next = await getTodayFeed();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh feed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (externalItems) {
      setData({
        generatedAt: new Date().toISOString(),
        items: externalItems
      });
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

      {data.items.length === 0 ? (
        <div
          style={{
            border: "1px dashed #d1d5db",
            borderRadius: 14,
            padding: 24,
            color: colors.textMuted
          }}
        >
          No items in Today Feed yet.
        </div>
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
