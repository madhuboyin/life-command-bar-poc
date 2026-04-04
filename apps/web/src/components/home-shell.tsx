"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
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
import { getDailyPulseState, getDashboardInsights, getTodayFeed } from "../lib/api";
import DashboardInsightsSection from "./dashboard-insights-section";
import DailyPulseEntryBanner from "./daily-pulse-entry-banner";

type Props = {
  initialData: TodayFeedResponse;
  initialError?: string | null;
  initialInsights: DashboardInsightsResponse | null;
  initialInsightsError?: string | null;
};

export default function HomeShell({
  initialData,
  initialError,
  initialInsights,
  initialInsightsError
}: Props) {
  const [externalItems, setExternalItems] = useState<TodayFeedItem[] | null>(null);
  const [insights, setInsights] = useState<DashboardInsightsResponse | null>(initialInsights);
  const [insightsError, setInsightsError] = useState<string | null>(
    initialInsightsError ?? null
  );
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [showDailyPulseBanner, setShowDailyPulseBanner] = useState(false);

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
      const [feedResult, insightsResult] = await Promise.allSettled([
        getTodayFeed(),
        getDashboardInsights()
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
    } finally {
      setInsightsLoading(false);
    }
  }

  const overview = (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Link href="/review" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
          Needs Review →
        </Link>
      </div>
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
