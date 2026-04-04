"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  AutoFlowListResponse,
  DashboardInsightsResponse,
  TodayFeedItem,
  TodayFeedResponse
} from "../lib/types";
import AddObligationForm from "./add-obligation-form";
import CommandBar from "./command-bar";
import TodayFeedClient from "./today-feed-client";
import UploadImportPanel from "./upload-import-panel";
import RemindersPanel from "./reminders-panel";
import DashboardTabs from "./dashboard-tabs";
import DashboardSummaryStrip from "./dashboard-summary-strip";
import {
  getAutoFlow,
  getDailyPulseState,
  getDashboardInsights,
  getTodayFeed
} from "../lib/api";
import DashboardInsightsSection from "./dashboard-insights-section";
import DailyPulseEntryBanner from "./daily-pulse-entry-banner";
import ReadyToActBanner from "./ready-to-act-banner";
import AutoFlowCard from "./auto-flow-card";
import MemoryContextCard from "./memory-context-card";
import UpcomingPredictionsPanel from "./upcoming-predictions-panel";

type Props = {
  initialData: TodayFeedResponse;
  initialError?: string | null;
  initialInsights: DashboardInsightsResponse | null;
  initialInsightsError?: string | null;
  initialAutoFlow: AutoFlowListResponse;
};

export default function HomeShell({
  initialData,
  initialError,
  initialInsights,
  initialInsightsError,
  initialAutoFlow
}: Props) {
  const [externalItems, setExternalItems] = useState<TodayFeedItem[] | null>(null);
  const [insights, setInsights] = useState<DashboardInsightsResponse | null>(initialInsights);
  const [insightsError, setInsightsError] = useState<string | null>(
    initialInsightsError ?? null
  );
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showDailyPulseBanner, setShowDailyPulseBanner] = useState(false);
  const [autoFlow, setAutoFlow] = useState<AutoFlowListResponse>(initialAutoFlow);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const state = await getDailyPulseState();
        if (!cancelled) {
          setShowDailyPulseBanner(!state.openedToday);
        }
      } catch {
        if (!cancelled) {
          setShowDailyPulseBanner(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveFeed: TodayFeedResponse = {
    generatedAt: initialData.generatedAt,
    items: externalItems ?? initialData.items
  };

  async function refreshInsightsFromServer() {
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      const next = await getDashboardInsights();
      setInsights(next);
    } catch (error) {
      setInsightsError(
        error instanceof Error ? error.message : "Could not refresh dashboard insights."
      );
    } finally {
      setInsightsLoading(false);
    }
  }

  async function refreshFromServer() {
    try {
      setInsightsLoading(true);
      setInsightsError(null);
      const [feedResult, insightsResult, autoFlowResult] = await Promise.allSettled([
        getTodayFeed(),
        getDashboardInsights(),
        getAutoFlow({ limit: 5 })
      ]);

      if (feedResult.status === "fulfilled") {
        setExternalItems(feedResult.value.items);
      } else {
        throw feedResult.reason;
      }

      if (insightsResult.status === "fulfilled") {
        setInsights(insightsResult.value);
        setInsightsError(null);
      } else {
        setInsightsError(
          insightsResult.reason instanceof Error
            ? insightsResult.reason.message
            : "Could not refresh dashboard insights."
        );
      }

      if (autoFlowResult.status === "fulfilled") {
        setAutoFlow(autoFlowResult.value);
      }
    } finally {
      setInsightsLoading(false);
    }
  }

  const overview = (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/control-tower" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
            Control Tower →
          </Link>
          <Link href="/review" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
            Needs Review →
          </Link>
        </div>
      </div>
      <ReadyToActBanner autoFlow={autoFlow} />
      <MemoryContextCard />
      <UpcomingPredictionsPanel />
      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "#ffffff",
          padding: 14
        }}
      >
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Short on time?</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          Use Focus Mode for a quick burst
        </div>
        <div style={{ color: "#6b7280", marginBottom: 10 }}>
          Pick 5, 10, or 15 minutes and we will queue the best items to clear now.
        </div>
        <Link href="/focus" style={{ textDecoration: "none", color: "#2563eb", fontWeight: 600 }}>
          I have a few minutes →
        </Link>
      </section>
      {autoFlow.items.length > 0 ? (
        <section style={{ display: "grid", gap: 10 }}>
          {autoFlow.items.slice(0, 1).map((item) => (
            <AutoFlowCard
              key={item.id}
              item={item}
              onUpdated={refreshFromServer}
              returnPath="/"
            />
          ))}
        </section>
      ) : null}
      {showDailyPulseBanner ? <DailyPulseEntryBanner /> : null}
      <DashboardInsightsSection
        data={insights}
        loading={insightsLoading}
        error={insightsError}
        onRefresh={refreshInsightsFromServer}
      />
      <DashboardSummaryStrip data={effectiveFeed} />
      <TodayFeedClient
        initialData={initialData}
        externalItems={externalItems}
        initialError={initialError}
        onRefreshComplete={refreshInsightsFromServer}
      />
    </div>
  );

  const capture = (
    <div style={{ display: "grid", gap: 24 }}>
      <CommandBar
        onFeedReplace={(items) => setExternalItems(items)}
        onCompleted={refreshFromServer}
      />
      <AddObligationForm onCreated={refreshFromServer} />
      <UploadImportPanel onCompleted={refreshFromServer} />
    </div>
  );

  const reminders = (
    <div style={{ display: "grid", gap: 24 }}>
      <RemindersPanel />
    </div>
  );

  return (
    <DashboardTabs
      overview={overview}
      capture={capture}
      reminders={reminders}
    />
  );
}
