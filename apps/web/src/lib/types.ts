export interface Obligation {
  id: string;
  userId: string;
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  title: string;
  description?: string | null;
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  source: "MANUAL" | "EMAIL" | "DOCUMENT" | "INFERRED";
  confidenceScore: number;
  urgencyScore: number;
  importanceScore: number;
  effortLevel: "LOW" | "MEDIUM" | "HIGH";
  impactLevel: "LOW" | "MEDIUM" | "HIGH";
  status: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED";
  lastShownAt?: string | null;
  lastActedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedAction {
  key: string;
  label: string;
}

export interface TodayFeedItem {
  id: string;
  obligationId: string;
  obligation: Obligation;
  whyItMatters: string;
  whatToDo: string;
  howHardIsIt: string;
  primaryAction: FeedAction;
  secondaryActions: FeedAction[];
  rank: number;
  hookType: "urgent" | "money" | "quick_win" | "none";
  generatedAt: string;
}

export interface TodayFeedResponse {
  generatedAt: string;
  items: TodayFeedItem[];
}

export type ObligationView =
  | "urgent"
  | "quick_wins"
  | "money"
  | "renewals"
  | "subscriptions"
  | "bills"
  | "postponed_recently"
  | "resolved_recently"
  | "active_now"
  | "commitments";

export type ObligationSort = "due_date" | "importance" | "urgency" | "created_at" | "amount";
export type SortDirection = "asc" | "desc";

export interface DashboardInsightCard {
  key: "attention" | "relief" | "quick_wins" | "money_exposure" | "postponed" | "open_category";
  title: string;
  value: string;
  supportingText: string;
  tone: "neutral" | "positive" | "warning";
  priority: number;
  targetView: ObligationView | null;
}

export interface DashboardTopInsight {
  title: string;
  description: string;
  tone: "neutral" | "positive" | "warning";
  targetView: ObligationView | null;
}

export interface DashboardInsightsResponse {
  summary: {
    handledThisWeek: number;
    activeNow: number;
    quickWinsAvailable: number;
    overdueOrUrgent: number;
    postponedRecently: number;
    reliefScore: {
      value: number;
      band: "LOW" | "MODERATE" | "STRONG";
    };
    estimatedMentalRelief: {
      value: number;
      label: string;
    };
    estimatedMoneyExposure: {
      amount: number | null;
      currency: string | null;
    };
    mostCommonOpenType: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT" | null;
  };
  cards: DashboardInsightCard[];
  topInsight: DashboardTopInsight;
}

export interface ResolutionRecommendation {
  flowKey: string;
  recommendation: string;
  whyItMatters: string;
  decisionOptions: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  recommendedOption: string;
  steps: string[];
  primaryAction: FeedAction;
  secondaryActions: FeedAction[];
}

export interface ResolutionResponse {
  obligationId: string;
  recommendation: ResolutionRecommendation;
}

export interface Reminder {
  id: string;
  obligationId?: string | null;
  title: string;
  scheduledFor: string;
  status: "SCHEDULED" | "TRIGGERED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}

export interface DailyPulseTopInsight {
  title: string;
  description: string;
  tone: "neutral" | "positive" | "warning";
}

export interface DailyPulseItem {
  obligationId: string;
  title: string;
  whyItMatters: string;
  actionLabel: string;
  hookType: "urgent" | "quick_win" | "money" | "postponed" | "important";
  priorityScore: number;
}

export interface DailyPulseResponse {
  generatedAt: string;
  topInsight: DailyPulseTopInsight;
  items: DailyPulseItem[];
  momentum: {
    handledThisWeek: number;
    trend: "up" | "down" | "flat";
  };
  quickSummary: string;
  state: {
    date: string;
    openedAt?: string | null;
    completedCount: number;
    dismissedCount: number;
  };
}

export interface DailyPulseState {
  date: string;
  openedToday: boolean;
  openedAt?: string | null;
  completedCount: number;
  dismissedCount: number;
}

export interface ObligationHistory {
  auditEvents: Array<{
    id: string;
    eventType: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
  }>;
  feedbackEvents: Array<{
    id: string;
    type: string;
    note?: string | null;
    createdAt: string;
  }>;
  resolutionRuns: Array<{
    id: string;
    flowKey: string;
    recommendedOption: string;
    confidence: string;
    createdAt: string;
  }>;
  reminders: Array<{
    id: string;
    title: string;
    status: string;
    scheduledFor: string;
    createdAt: string;
  }>;
  guidedJourneyEvents: Array<{
    id: string;
    journeyId: string;
    eventType: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
  }>;
  guidedJourneys: Array<{
    id: string;
    journeyType: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
    status: "ACTIVE" | "COMPLETED" | "DISMISSED" | "ABANDONED";
    currentStepIndex: number;
    totalSteps: number;
    completedSteps: number;
    createdAt: string;
    updatedAt: string;
    completedAt?: string | null;
  }>;
}

export interface GuidedJourneyOption {
  key: string;
  label: string;
  description?: string;
}

export interface GuidedJourneyStep {
  key: string;
  title: string;
  description: string;
  whyItMatters: string;
  inputType: "NONE" | "SINGLE_SELECT";
  options: GuidedJourneyOption[];
  recommendedOption?: string | null;
  selectedOption?: string | null;
  isCompleted: boolean;
  completedAt?: string | null;
  position: number;
}

export interface GuidedJourney {
  id: string;
  obligationId: string;
  journeyType: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  status: "ACTIVE" | "COMPLETED" | "DISMISSED" | "ABANDONED";
  currentStepKey?: string | null;
  currentStepIndex: number;
  totalSteps: number;
  progressPercent: number;
  summary?: string | null;
  recommendedPath?: string | null;
  currentStep?: GuidedJourneyStep | null;
  steps: GuidedJourneyStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface CommandParseResponse {
  intent: string;
  confidence: number;
  entities: Record<string, unknown>;
  resolution: {
    type: string;
    obligationId?: string;
  };
  needsClarification: boolean;
  question?: string;
}

export interface CommandExecuteResponse {
  resultType:
    | "today_feed"
    | "obligation_list"
    | "resolution_flow"
    | "new_obligation_candidate"
    | "clarification";
  items?: TodayFeedItem[] | Obligation[];
  generatedAt?: string;
  obligationId?: string;
  recommendation?: ResolutionRecommendation;
  title?: string | null;
  question?: string;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}
