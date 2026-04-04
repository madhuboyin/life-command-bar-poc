"use client";

import { useEffect, useState } from "react";
import { getMemorySummary, rebuildMemory } from "../lib/api";
import type { MemorySummary } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import StatusMessage from "./ui/status-message";

export default function MemoryContextCard() {
  const [summary, setSummary] = useState<MemorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const next = await getMemorySummary();
        if (!cancelled) {
          setSummary(next);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load memory context");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefresh() {
    try {
      setRefreshing(true);
      setError(null);
      await rebuildMemory();
      const next = await getMemorySummary();
      setSummary(next);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh memory");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <section style={cardStyles.item}>
        <div style={{ fontSize: 13, color: colors.textMuted }}>Loading home memory…</div>
      </section>
    );
  }

  return (
    <section style={cardStyles.item}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
            Home Memory
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            {summary?.currentContext.currentFocus
              ? `Current focus: ${summary.currentContext.currentFocus}`
              : "Learning your patterns"}
          </div>
          <div style={{ fontSize: 13, color: colors.textMuted }}>
            Cognitive load score {Math.round(summary?.currentContext.cognitiveLoadScore ?? 0)}
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          style={buttonStyles.secondary}
        >
          {refreshing ? "Refreshing..." : "Refresh memory"}
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: colors.textMuted }}>
        {summary?.recurringPatterns.length
          ? `${summary.recurringPatterns.length} recurring pattern${summary.recurringPatterns.length === 1 ? "" : "s"} detected.`
          : "No stable recurring pattern detected yet."}
      </div>

      {summary?.topVendors.length ? (
        <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted }}>
          Top vendors: {summary.topVendors.slice(0, 3).join(" · ")}
        </div>
      ) : null}

      {summary?.behaviorProfile.labels.length ? (
        <div style={{ marginTop: 8, fontSize: 13, color: colors.textMuted }}>
          Behavior profile: {summary.behaviorProfile.labels.join(" · ")}
        </div>
      ) : null}

      {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
    </section>
  );
}
