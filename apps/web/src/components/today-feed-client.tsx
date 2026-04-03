"use client";

import { useCallback, useEffect, useState } from "react";
import { getTodayFeed } from "../lib/api";
import type { TodayFeedResponse } from "../lib/types";
import TodayFeedCard from "./today-feed-card";

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
    <section
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Today Feed</h2>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Focused list of what is most worth handling now
          </div>
        </div>

        <button onClick={refresh} disabled={loading} style={refreshButton}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: 10,
            borderRadius: 10,
            background: "#fef2f2",
            color: "#991b1b"
          }}
        >
          {error}
        </div>
      )}

      {data.items.length === 0 ? (
        <div
          style={{
            border: "1px dashed #d1d5db",
            borderRadius: 14,
            padding: 24,
            color: "#6b7280"
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
    </section>
  );
}

const refreshButton: React.CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer"
};
