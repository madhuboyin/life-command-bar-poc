import HomeShell from "../components/home-shell";
import PageHeader from "../components/ui/page-header";
import { getDashboardInsights, getTodayFeed } from "../lib/api";
import type { DashboardInsightsResponse, TodayFeedResponse } from "../lib/types";
import { pageStyles } from "../lib/ui";

export default async function HomePage() {
  let data: TodayFeedResponse = {
    generatedAt: new Date().toISOString(),
    items: []
  };
  let insights: DashboardInsightsResponse | null = null;
  let initialError: string | null = null;
  let initialInsightsError: string | null = null;

  const [feedResult, insightsResult] = await Promise.allSettled([
    getTodayFeed(),
    getDashboardInsights()
  ]);

  if (feedResult.status === "fulfilled") {
    data = feedResult.value;
  } else {
    initialError =
      feedResult.reason instanceof Error
        ? feedResult.reason.message
        : "Could not load your Today Feed right now.";
  }

  if (insightsResult.status === "fulfilled") {
    insights = insightsResult.value;
  } else {
    initialInsightsError =
      insightsResult.reason instanceof Error
        ? insightsResult.reason.message
        : "Could not load dashboard insights right now.";
  }

  return (
    <main style={pageStyles.shell}>
      <PageHeader
        title="Life Command Bar"
        description="Your daily command center for real-life admin."
      />

      <HomeShell
        initialData={data}
        initialError={initialError}
        initialInsights={insights}
        initialInsightsError={initialInsightsError}
      />
    </main>
  );
}
