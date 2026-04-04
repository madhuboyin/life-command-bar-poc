import DailyPulseShell from "../../components/daily-pulse-shell";
import { getAutoFlow, getDailyPulse } from "../../lib/api";
import type { AutoFlowListResponse, DailyPulseResponse } from "../../lib/types";

export default async function PulsePage() {
  let pulse: DailyPulseResponse | null = null;
  let autoFlow: AutoFlowListResponse = {
    generatedAt: new Date().toISOString(),
    items: [],
    summary: {
      readyCount: 0,
      suggestedCount: 0
    }
  };
  let error: string | null = null;

  try {
    const [pulseData, autoFlowData] = await Promise.all([
      getDailyPulse({ markOpened: true }),
      getAutoFlow({ limit: 5 })
    ]);
    pulse = pulseData;
    autoFlow = autoFlowData;
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load your daily pulse right now.";
  }

  return (
    <DailyPulseShell
      initialPulse={pulse}
      initialAutoFlow={autoFlow}
      initialError={error}
    />
  );
}
