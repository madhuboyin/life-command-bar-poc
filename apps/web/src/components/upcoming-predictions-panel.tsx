"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getUpcomingPredictions } from "../lib/api";
import type { PredictionItem, PredictionUpcomingResponse } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import PredictionCard from "./prediction-card";
import EmptyState from "./ui/empty-state";

type Props = {
  initialData?: PredictionUpcomingResponse | null;
  limit?: number;
  showActions?: boolean;
  showHeaderLink?: boolean;
};

export default function UpcomingPredictionsPanel({
  initialData = null,
  limit = 3,
  showActions = false,
  showHeaderLink = true
}: Props) {
  const [data, setData] = useState<PredictionUpcomingResponse | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        const next = await getUpcomingPredictions();
        if (!cancelled) {
          setData(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load upcoming signals");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const items = (data?.items ?? []).slice(0, limit);

  async function refresh() {
    try {
      setLoading(true);
      const next = await getUpcomingPredictions();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh upcoming signals");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={cardStyles.section}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          gap: 10,
          flexWrap: "wrap"
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>Upcoming</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Prepare early</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {showHeaderLink ? (
            <Link href="/upcoming" style={buttonStyles.link}>
              View all
            </Link>
          ) : null}
          <button type="button" onClick={() => void refresh()} disabled={loading} style={buttonStyles.secondary}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div style={{ color: "#991b1b", marginBottom: 8 }}>{error}</div> : null}

      {items.length === 0 && !loading ? (
        <EmptyState
          title="No strong upcoming signals"
          description="As patterns stabilize, this area will show what is likely coming next."
        />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => (
            <PredictionCard
              key={item.id}
              item={item as PredictionItem}
              compact
              showActions={showActions}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}
