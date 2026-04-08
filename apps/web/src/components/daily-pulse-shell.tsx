"use client";

import Link from "next/link";
import { useState } from "react";
import { getAutoFlow, getDailyPulse } from "../lib/api";
import type {
  AutoFlowListResponse,
  DailyPulseItemUpdateResponse,
  DailyPulseResponse
} from "../lib/types";
import { buttonStyles, cardStyles, colors, pageStyles } from "../lib/ui";
import {
  buildActionLabel,
  buildEmptyStateMessage,
  buildRecommendationMessage
} from "../lib/human-language.service";
import {
  buildCompletionReliefMessage,
  buildPrimaryReassurance
} from "../lib/emotional-trust.service";
import DailyPulseProgress from "./daily-pulse-progress";
import EmptyState from "./ui/empty-state";
import LoadingCard from "./ui/loading-card";
import PulseItemCard from "./pulse-item-card";
import PulseCompletionCard from "./pulse-completion-card";
import PulseMomentumCard from "./pulse-momentum-card";
import WhyThisExplanation from "./why-this-explanation";
import ReadyToActBanner from "./ready-to-act-banner";
import AutoFlowCard from "./auto-flow-card";
import PredictionCard from "./prediction-card";

type Props = {
  initialPulse: DailyPulseResponse | null;
  initialAutoFlow: AutoFlowListResponse;
  initialError?: string | null;
};

export default function DailyPulseShell({
  initialPulse,
  initialAutoFlow,
  initialError = null
}: Props) {
  const pulseEmptyMessage = buildEmptyStateMessage("daily_pulse");
  const pulseReassurance = buildPrimaryReassurance({
    emotionalState: "CALM_CLEAR"
  });
  const [pulse, setPulse] = useState<DailyPulseResponse | null>(initialPulse);
  const [autoFlow, setAutoFlow] = useState<AutoFlowListResponse>(initialAutoFlow);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function refreshPulse() {
    try {
      setLoading(true);
      setError(null);
      const [data, autoFlowData] = await Promise.all([
        getDailyPulse({ refresh: true, markOpened: true }),
        getAutoFlow({ limit: 5 })
      ]);
      setPulse(data);
      setAutoFlow(autoFlowData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh pulse");
    } finally {
      setLoading(false);
    }
  }

  function handleItemUpdated(update: DailyPulseItemUpdateResponse) {
    const shouldRemove =
      update.status === "COMPLETED" ||
      update.status === "POSTPONED" ||
      update.status === "DISMISSED";

    setPulse((current) => {
      if (!current) return current;

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

    if (shouldRemove) {
      void refreshPulse();
    }
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
            {pulseReassurance.supporting ?? "One clear step at a time."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/today" style={buttonStyles.link}>
            Open Today View
          </Link>
          <button onClick={refreshPulse} disabled={loading} style={buttonStyles.secondary}>
            {loading ? "Refreshing..." : "Refresh pulse"}
          </button>
        </div>
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
          <ReadyToActBanner autoFlow={autoFlow} />

          {autoFlow.items.length > 0 ? (
            <section style={cardStyles.section}>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
                Auto-Flow
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {autoFlow.items.slice(0, 2).map((item) => (
                  <AutoFlowCard key={item.id} item={item} onUpdated={refreshPulse} />
                ))}
              </div>
            </section>
          ) : null}

          <section style={cardStyles.section}>
            <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
              Top Insight
            </div>
            <h2 style={{ margin: "0 0 6px 0", fontSize: 24 }}>{pulse.topInsight.title}</h2>
            <p style={{ margin: 0, color: colors.textMuted }}>{pulse.topInsight.description}</p>
            <div style={{ marginTop: 10 }}>
              <WhyThisExplanation why={pulse.topInsight.why} decisionTrace={pulse.topInsight.decisionTrace} />
            </div>
          </section>

          <DailyPulseProgress progress={pulse.progress} />
          <PulseMomentumCard momentum={pulse.momentum} quickSummary={pulse.quickSummary} />

          {pulse.upcomingPredictions && pulse.upcomingPredictions.length > 0 ? (
            <section style={cardStyles.section}>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
                Prepare Soon
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {pulse.upcomingPredictions.slice(0, 2).map((prediction) => (
                  <PredictionCard key={prediction.id} item={prediction} compact />
                ))}
              </div>
            </section>
          ) : null}

          {pulse.subscriptionSignals &&
          (pulse.subscriptionSignals.items.length > 0 ||
            pulse.subscriptionSignals.summaryLine) ? (
            <section style={cardStyles.section}>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
                Subscription updates
              </div>
              {pulse.subscriptionSignals.summaryLine ? (
                <div style={{ marginBottom: 10, color: colors.textMuted }}>
                  {pulse.subscriptionSignals.summaryLine}
                </div>
              ) : null}
              <div style={{ marginBottom: 10 }}>
                <Link href="/subscriptions/review" style={buttonStyles.link}>
                  Open Subscription Review Hub
                </Link>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {pulse.subscriptionSignals.items.map((item) => (
                  <article
                    key={`${item.subscriptionId}_${item.insightType}`}
                    style={{ ...cardStyles.item, display: "grid", gap: 6 }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{item.title}</strong>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>
                        {item.severity.toLowerCase()}
                      </span>
                    </div>
                    <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.insightTitle}</div>
                    <div style={{ fontSize: 13 }}>
                      {buildRecommendationMessage({
                        recommendationType: item.recommendationType,
                        issue: item.insightType
                      }).primary}
                    </div>
                    <div>
                      <Link href={`/subscriptions/review/${item.subscriptionId}`} style={buttonStyles.link}>
                        {buildActionLabel("review")}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {pulse.progress.totalItems === 0 ? (
            <EmptyState
              title={buildCompletionReliefMessage().primary}
              description={pulseEmptyMessage.context ?? "Nothing important needs attention right now."}
            />
          ) : pulse.progress.isCompletedForNow ? (
            <PulseCompletionCard onRefresh={refreshPulse} />
          ) : pulse.items.length === 0 ? (
            <EmptyState
              title="Pulse is updating"
              description="No pending pulse items are visible right now. Refresh if you want a quick sync."
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
                flowObligationIds={pulse.items.map((pulseItem) => pulseItem.obligationId)}
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
    return "You're all clear for now.";
  }

  if (progress.isCompletedForNow) {
    return "You're done for now.";
  }

  if (progress.remainingCount === 1) {
    return "One item left in today's pulse.";
  }

  return `${progress.remainingCount} items still in today's pulse.`;
}
