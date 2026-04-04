export type FlowSourceType =
  | "DAILY_PULSE"
  | "TODAY_FEED"
  | "DASHBOARD"
  | "OBLIGATION_DETAIL";

export type FlowSessionState = "ACTIVE" | "COMPLETED" | "ABANDONED";

export type FlowSourceContext = {
  label?: string;
  returnPath?: string;
  filterView?: string;
  obligationIds?: string[];
  handledObligationIds?: string[];
};

export type FlowSessionSummary = {
  totalItems: number;
  handledCount: number;
  remainingCount: number;
  progressPercent: number;
};

export type FlowSessionNextItem = {
  obligationId: string;
  title: string;
} | null;

export type FlowSessionPayload = {
  id: string;
  sourceType: FlowSourceType;
  sourceContext: FlowSourceContext | null;
  state: FlowSessionState;
  currentObligationId: string | null;
  currentJourneyId: string | null;
  currentObligationTitle: string | null;
  summary: FlowSessionSummary;
  nextItem: FlowSessionNextItem;
  createdAt: string;
  updatedAt: string;
};
