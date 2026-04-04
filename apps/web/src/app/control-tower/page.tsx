import ControlTowerShell from "../../components/control-tower-shell";
import { getControlTower } from "../../lib/api";
import type { ControlTowerResponse } from "../../lib/types";

export default async function ControlTowerPage() {
  let data: ControlTowerResponse | null = null;
  let error: string | null = null;

  try {
    data = await getControlTower({
      reviewLimit: 6,
      readyLimit: 6,
      upcomingLimitPerWindow: 4,
      recentLimit: 6,
      systemDecisionsLimit: 6
    });
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load control tower right now.";
  }

  return <ControlTowerShell initialData={data} initialError={error} />;
}
