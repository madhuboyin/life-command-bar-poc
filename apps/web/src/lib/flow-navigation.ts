import type { FlowSession, FlowSourceType } from "./types";

export function getSourceLabel(sourceType: FlowSourceType) {
  switch (sourceType) {
    case "DAILY_PULSE":
      return "From Today's Pulse";
    case "TODAY_FEED":
      return "From Today Feed";
    case "DASHBOARD":
      return "From Dashboard";
    case "AUTO_FLOW":
      return "From Auto-Flow";
    default:
      return "From Obligation Detail";
  }
}

export function buildGuidedHref(journeyId: string, flowSessionId?: string | null) {
  if (!flowSessionId) return `/guided/${journeyId}`;
  return `/guided/${journeyId}?flowSessionId=${encodeURIComponent(flowSessionId)}`;
}

export function getFlowReturnPath(session: FlowSession | null | undefined) {
  return session?.sourceContext?.returnPath || "/obligations";
}
