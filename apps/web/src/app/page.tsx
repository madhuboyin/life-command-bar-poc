import HomeShell from "../components/home-shell";
import SignInButton from "../components/sign-in-button";
import PageHeader from "../components/ui/page-header";
import { getAutoFlow, getDashboardInsights, getTodayFeed } from "../lib/api";
import { auth } from "../auth";
import type {
  AutoFlowListResponse,
  DashboardInsightsResponse,
  TodayFeedResponse
} from "../lib/types";
import { cardStyles, pageStyles } from "../lib/ui";

export default async function HomePage() {
  const session = await auth();
  const googleConfigured = Boolean(
    (process.env.AUTH_GOOGLE_ID || "").trim() &&
      (process.env.AUTH_GOOGLE_SECRET || "").trim()
  );

  if (!session?.user?.id) {
    return (
      <main style={pageStyles.shell}>
        <section style={{ ...cardStyles.section, maxWidth: 680, margin: "64px auto 0 auto" }}>
          <PageHeader
            title="Life Command Bar"
            description="Your daily command center for real-life admin."
          />
          <SignInButton callbackUrl="/" disabled={!googleConfigured} />
        </section>
      </main>
    );
  }

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
