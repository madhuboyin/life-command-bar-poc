import GuidedJourneyShell from "../../../components/guided-journey-shell";
import { getFlowSessionById, getGuidedJourneyById } from "../../../lib/api";
import type { FlowSession, GuidedJourney } from "../../../lib/types";

type Props = {
  params?: Promise<{ id?: string } | undefined>;
  searchParams?: Promise<{ flowSessionId?: string | string[] } | undefined>;
};

export default async function GuidedJourneyPage({ params, searchParams }: Props) {
  const resolvedParams = (await params) ?? {};
  const resolvedSearchParams = (await searchParams) ?? {};
  const journeyId = resolvedParams.id;
  const flowSessionId = readFirstParam(resolvedSearchParams.flowSessionId) ?? null;

  if (!journeyId) {
    return <GuidedJourneyShell initialJourney={null} initialError="Journey id is missing." />;
  }

  let journey: GuidedJourney | null = null;
  let flowSession: FlowSession | null = null;
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

  if (flowSessionId) {
    try {
      const data = await getFlowSessionById(flowSessionId);
      flowSession = data.session;
    } catch {
      flowSession = null;
    }
  }

  return (
    <GuidedJourneyShell
      initialJourney={journey}
      initialFlowSession={flowSession}
      flowSessionId={flowSessionId}
      initialError={error}
    />
  );
}

function readFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}
