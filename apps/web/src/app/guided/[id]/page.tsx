import GuidedJourneyShell from "../../../components/guided-journey-shell";
import { getGuidedJourneyById } from "../../../lib/api";
import type { GuidedJourney } from "../../../lib/types";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
};

export default async function GuidedJourneyPage({ params }: Props) {
  const resolvedParams = (await params) ?? {};
  const journeyId = resolvedParams.id;

  if (!journeyId) {
    return <GuidedJourneyShell initialJourney={null} initialError="Journey id is missing." />;
  }

  let journey: GuidedJourney | null = null;
  let error: string | null = null;

  try {
    const data = await getGuidedJourneyById(journeyId);
    journey = data.journey;
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load guided journey right now.";
  }

  return <GuidedJourneyShell initialJourney={journey} initialError={error} />;
}
