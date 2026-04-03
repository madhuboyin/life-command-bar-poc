import HomeShell from "../components/home-shell";
import PageHeader from "../components/ui/page-header";
import { getTodayFeed } from "../lib/api";
import { pageStyles } from "../lib/ui";

export default async function HomePage() {
  const data = await getTodayFeed();

  return (
    <main style={pageStyles.shell}>
      <PageHeader
        title="Life Command Bar"
        description="Your daily command center for real-life admin."
      />

      <HomeShell initialData={data} />
    </main>
  );
}
