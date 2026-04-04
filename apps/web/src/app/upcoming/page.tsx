import Link from "next/link";
import UpcomingPredictionsPanel from "../../components/upcoming-predictions-panel";
import PageHeader from "../../components/ui/page-header";
import { getUpcomingPredictions } from "../../lib/api";
import type { PredictionUpcomingResponse } from "../../lib/types";
import { pageStyles } from "../../lib/ui";

export default async function UpcomingPage() {
  let upcoming: PredictionUpcomingResponse | null = null;
  let error: string | null = null;

  try {
    upcoming = await getUpcomingPredictions();
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load upcoming predictions right now.";
  }

  return (
    <main style={pageStyles.shell}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>
      <PageHeader
        title="Upcoming"
        description="Likely future obligations and workload signals, grounded in your history."
      />

      {error ? (
        <section
          style={{
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: 14,
            background: "#fef2f2",
            color: "#991b1b"
          }}
        >
          {error}
        </section>
      ) : (
        <UpcomingPredictionsPanel
          initialData={upcoming}
          limit={20}
          showActions
          showHeaderLink={false}
        />
      )}
    </main>
  );
}
