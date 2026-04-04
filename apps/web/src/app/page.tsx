import HomeShell from "../components/home-shell";
import PageHeader from "../components/ui/page-header";
import { getAutoFlow, getDashboardInsights, getTodayFeed } from "../lib/api";
import type {
  AutoFlowListResponse,
  DashboardInsightsResponse,
  TodayFeedResponse
} from "../lib/types";
import { pageStyles } from "../lib/ui";

export default async function HomePage() {
  let data: TodayFeedResponse = {
    generatedAt: new Date().toISOString(),
    items: []
  };
  let insights: DashboardInsightsResponse | null = null;
  let autoFlow: AutoFlowListResponse = {
    generatedAt: new Date().toISOString(),
    items: [],
    summary: {
      readyCount: 0,
      suggestedCount: 0
    }
  };
  let initialError: string | null = null;
  let initialInsightsError: string | null = null;

  const [feedResult, insightsResult, autoFlowResult] = await Promise.allSettled([
    getTodayFeed(),
    getDashboardInsights(),
    getAutoFlow({ limit: 5 })
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

  if (autoFlowResult.status === "fulfilled") {
    autoFlow = autoFlowResult.value;
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
        initialAutoFlow={autoFlow}
      />
    </main>
  );
}
