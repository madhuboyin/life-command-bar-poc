import HomeShell from "../components/home-shell";
import PageHeader from "../components/ui/page-header";
import { getTodayFeed } from "../lib/api";
import type { TodayFeedResponse } from "../lib/types";
import { pageStyles } from "../lib/ui";

export default async function HomePage() {
  let data: TodayFeedResponse = {
    generatedAt: new Date().toISOString(),
    items: []
  };
  let initialError: string | null = null;

  try {
    data = await getTodayFeed();
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "Could not load your Today Feed right now.";
  }

  return (
    <main style={pageStyles.shell}>
      <PageHeader
        title="Life Command Bar"
        description="Your daily command center for real-life admin."
      />

      <HomeShell initialData={data} initialError={initialError} />
    </main>
  );
}
