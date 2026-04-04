"use client";

import Link from "next/link";
import { useState } from "react";
import { getDailyPulse } from "../lib/api";
import type {
  DailyPulseItemUpdateResponse,
  DailyPulseResponse
} from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles } from "../lib/ui";
import DailyPulseProgress from "./daily-pulse-progress";
import EmptyState from "./ui/empty-state";
import LoadingCard from "./ui/loading-card";
import PulseItemCard from "./pulse-item-card";
import PulseCompletionCard from "./pulse-completion-card";
import PulseMomentumCard from "./pulse-momentum-card";

type Props = {
  initialPulse: DailyPulseResponse | null;
  initialError?: string | null;
};

export default function DailyPulseShell({
  initialPulse,
  initialError = null
}: Props) {
  const [pulse, setPulse] = useState<DailyPulseResponse | null>(initialPulse);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function refreshPulse() {
    try {
      setLoading(true);
      setError(null);
      const data = await getDailyPulse({ refresh: true, markOpened: true });
      setPulse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh pulse");
    } finally {
      setLoading(false);
    }
  }

  function handleItemUpdated(update: DailyPulseItemUpdateResponse) {
    setPulse((current) => {
      if (!current) return current;
      const shouldRemove =
        update.status === "COMPLETED" ||
        update.status === "POSTPONED" ||
        update.status === "DISMISSED";

      const nextItems = shouldRemove
        ? current.items.filter((item) => item.obligationId !== update.obligationId)
        : current.items.map((item) =>
            item.obligationId === update.obligationId
              ? {
                  ...item,
                  status: update.status === "OPENED_GUIDED" ? "OPENED_GUIDED" : item.status
                }
              : item
          );

      return {
        ...current,
        items: nextItems,
        progress: update.progress,
        momentum: update.momentum,
        quickSummary: getQuickSummaryFromProgress(update.progress)
      };
    });
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 20
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 6px 0", fontSize: 34 }}>Today</h1>
          <p style={{ margin: 0, color: colors.textMuted }}>
            Your day in five decisions.
          </p>
        </div>
        <button onClick={refreshPulse} disabled={loading} style={buttonStyles.secondary}>
          {loading ? "Refreshing..." : "Refresh pulse"}
        </button>
      </header>

      {loading && !pulse ? (
        <div style={{ display: "grid", gap: 14 }}>
          <LoadingCard title="Building your daily pulse..." lines={3} />
          <LoadingCard title="Building your daily pulse..." lines={3} />
        </div>
      ) : null}

      {error ? (
        <section style={cardStyles.bordered}>
          <div style={{ color: "#991b1b", marginBottom: 10 }}>{error}</div>
          <button onClick={refreshPulse} style={buttonStyles.secondary}>
            Try again
          </button>
        </section>
      ) : null}

      {pulse ? (
        <div style={{ display: "grid", gap: 14 }}>
          <section style={cardStyles.section}>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
              Top Insight
            </div>
            <h2 style={{ margin: "0 0 6px 0", fontSize: 24 }}>{pulse.topInsight.title}</h2>
            <p style={{ margin: 0, color: colors.textMuted }}>{pulse.topInsight.description}</p>
          </section>

          <DailyPulseProgress progress={pulse.progress} />
          <PulseMomentumCard momentum={pulse.momentum} quickSummary={pulse.quickSummary} />

          {pulse.progress.totalItems === 0 ? (
            <EmptyState
              title="You are all caught up today"
              description="No high-priority items need action right now. Check back tomorrow."
            />
          ) : pulse.progress.isCompletedForNow ? (
            <PulseCompletionCard onRefresh={refreshPulse} />
          ) : pulse.items.length === 0 ? (
            <EmptyState
              title="Pulse is updating"
              description="No pending pulse items are visible right now. Refresh to sync the latest status."
              action={
                <button onClick={refreshPulse} style={buttonStyles.secondary}>
                  Refresh pulse
                </button>
              }
            />
          ) : (
            pulse.items.slice(0, 5).map((item) => (
              <PulseItemCard
                key={item.obligationId}
                item={item}
                onItemUpdated={handleItemUpdated}
              />
            ))
          )}
        </div>
      ) : null}
    </main>
  );
}

function getQuickSummaryFromProgress(progress: DailyPulseResponse["progress"]) {
  if (progress.totalItems === 0) {
    return "You're all caught up today.";
  }

  if (progress.isCompletedForNow) {
    return "You handled today's pulse and are done for now.";
  }

  if (progress.remainingCount === 1) {
    return "One item left in today's pulse.";
  }

  return `${progress.remainingCount} items still in today's pulse.`;
}
