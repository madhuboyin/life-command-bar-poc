import DailyPulseShell from "../../components/daily-pulse-shell";
import { getDailyPulse } from "../../lib/api";
import type { DailyPulseResponse } from "../../lib/types";

export default async function PulsePage() {
  let pulse: DailyPulseResponse | null = null;
  let error: string | null = null;

  try {
    pulse = await getDailyPulse({ markOpened: true });
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load your daily pulse right now.";
  }

  return <DailyPulseShell initialPulse={pulse} initialError={error} />;
}
