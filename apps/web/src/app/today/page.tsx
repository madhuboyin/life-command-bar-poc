import TodayViewShell from "../../components/today-view-shell";
import { getTodayView } from "../../lib/api";
import type { DailyCommandCenterResponse } from "../../lib/types";

export default async function TodayPage() {
  let data: DailyCommandCenterResponse | null = null;
  let error: string | null = null;

  try {
    data = await getTodayView();
  } catch (fetchError) {
    error =
      fetchError instanceof Error
        ? fetchError.message
        : "Could not load Today View right now.";
  }

  return <TodayViewShell initialData={data} initialError={error} />;
}
