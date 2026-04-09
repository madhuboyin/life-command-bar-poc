import type { DailyCommandCenterResponse } from "../lib/types";

export function shouldShowHeaderUpcomingAction(
  data: DailyCommandCenterResponse | null
) {
  if (!data?.viewUpcomingAvailable) return false;
  if (data.todayState === "CLEAR") return false;
  return Boolean(data.primaryItem);
}
