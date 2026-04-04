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
  importSourceId?: string | null;
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
  sourceType: TrustSourceType;
  sourceMetadata: ObligationSourceMetadata;
  ingestionConfidence: number;
  confidenceBand: ConfidenceBand;
  extractedFields: ObligationExtractedFields | null;
  extractionStatus:
    | "RECEIVED"
    | "PARTIAL"
    | "READY"
    | "NEEDS_CONFIRMATION"
    | "REJECTED"
    | "FAILED"
    | null;
  needsReview: boolean;
  duplicateCandidate: boolean;
  conflictDetected: boolean;
}

export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export type TrustSourceType = "EMAIL" | "UPLOAD" | "COMMAND" | "MANUAL";

export interface WhyExplanation {
  primaryReason: string;
  signals: string[];
  confidence: number;
  personalizationReason: string | null;
}

export interface DecisionTrace {
  sourceSignals: string[];
  rankingFactors: string[];
  suppressionFactors: string[];
  confidenceDrivers: string[];
}

export interface ObligationExtractedFields {
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT" | null;
  title: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  recurrence: string | null;
  description: string | null;
}

export interface ObligationSourceMetadata {
  importSourceId: string | null;
  sourceSubtype: "EMAIL_FORWARD" | "FILE_UPLOAD" | "COMMAND_CAPTURE" | null;
  importedAt: string | null;
  parserVersion: string | null;
  parseStatus:
    | "RECEIVED"
    | "PARTIAL"
    | "READY"
    | "NEEDS_CONFIRMATION"
    | "REJECTED"
    | "FAILED"
    | null;
  parseConfidence: number | null;
  provenanceLabel: string;
  rawData?: Record<string, unknown> | null;
  duplicateOfObligationId?: string | null;
  conflictWithObligationId?: string | null;
}

export interface FeedAction {
  key: string;
  label: string;
}

export interface TodayFeedItem {
  id: string;
  obligationId: string;
  obligation: Obligation;
  why: WhyExplanation;
  whyItMatters: string;
  whatToDo: string;
  howHardIsIt: string;
  primaryAction: FeedAction;
  secondaryActions: FeedAction[];
  rank: number;
  hookType: "urgent" | "money" | "quick_win" | "none";
  autoFlow: AutoFlowItemSummary | null;
  confidenceBand: ConfidenceBand;
  sourceType: TrustSourceType;
  needsReview: boolean;
  decisionTrace?: DecisionTrace;
  generatedAt: string;
}

export interface TodayFeedResponse {
  generatedAt: string;
  items: TodayFeedItem[];
}

export type FlowSourceType =
  | "DAILY_PULSE"
  | "TODAY_FEED"
  | "DASHBOARD"
  | "OBLIGATION_DETAIL"
  | "AUTO_FLOW"
  | "FOCUS_MODE";

export type FlowSessionState = "ACTIVE" | "COMPLETED" | "ABANDONED";

export interface FlowSourceContext {
  label?: string;
  returnPath?: string;
  filterView?: string;
  obligationIds?: string[];
  handledObligationIds?: string[];
}

export interface FlowSession {
  id: string;
  sourceType: FlowSourceType;
  sourceContext: FlowSourceContext | null;
  state: FlowSessionState;
  currentObligationId?: string | null;
  currentJourneyId?: string | null;
  currentObligationTitle?: string | null;
  summary: {
    totalItems: number;
    handledCount: number;
    remainingCount: number;
    progressPercent: number;
  };
  nextItem: {
    obligationId: string;
    title: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type FocusSessionState = "ACTIVE" | "COMPLETED" | "ABANDONED";
export type FocusSessionItemStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "POSTPONED"
  | "DISMISSED"
  | "SKIPPED";

export interface FocusSessionItem {
  id: string;
  obligationId: string;
  title: string;
  whyIncluded: string;
  estimatedMinutes: number;
  priorityScore: number;
  status: FocusSessionItemStatus;
  sourceType: TrustSourceType;
  confidenceBand: ConfidenceBand;
  needsReview: boolean;
  obligation: Obligation;
}

export interface FocusSession {
  id: string;
  durationMinutes: number;
  state: FocusSessionState;
  totalItems: number;
  completedCount: number;
  postponedCount: number;
  dismissedCount: number;
  skippedCount: number;
  remainingCount: number;
  progressPercent: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: {
    line: string;
    completionMessage: string | null;
  };
  currentItem: FocusSessionItem | null;
  items: FocusSessionItem[];
}

export interface FocusSessionResponse {
  session: FocusSession;
}

export interface FocusSessionCreateResponse extends FocusSessionResponse {
  resumedExisting: boolean;
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
  why: WhyExplanation;
  decisionTrace?: DecisionTrace;
}

export interface DashboardTopInsight {
  title: string;
  description: string;
  tone: "neutral" | "positive" | "warning";
  targetView: ObligationView | null;
  why: WhyExplanation;
  decisionTrace?: DecisionTrace;
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

export interface AutoFlowItemSummary {
  id: string;
  triggerType:
    | "INGESTION_TRIGGER"
    | "URGENCY_TRIGGER"
    | "PATTERN_TRIGGER"
    | "REMINDER_TRIGGER";
  state: "READY" | "SUGGESTED" | "ACCEPTED" | "DISMISSED";
  priorityScore: number;
  ctaLabel: string;
}

export interface AutoFlowItem {
  id: string;
  obligationId: string;
  triggerType:
    | "INGESTION_TRIGGER"
    | "URGENCY_TRIGGER"
    | "PATTERN_TRIGGER"
    | "REMINDER_TRIGGER";
  state: "READY" | "SUGGESTED" | "ACCEPTED" | "DISMISSED";
  confidence: number;
  urgencyScore: number;
  priorityScore: number;
  source: string | null;
  reason: string | null;
  timestamp: string;
  obligation: Obligation;
  why: WhyExplanation;
  decisionTrace: DecisionTrace;
  cta: {
    label: string;
    action: "OPEN_GUIDED";
  };
}

export interface AutoFlowListResponse {
  generatedAt: string;
  items: AutoFlowItem[];
  summary: {
    readyCount: number;
    suggestedCount: number;
  };
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
  why: WhyExplanation;
  decisionTrace?: DecisionTrace;
}

export interface DailyPulseItem {
  obligationId: string;
  title: string;
  sourceType: TrustSourceType;
  confidenceBand: ConfidenceBand;
  needsReview: boolean;
  why: WhyExplanation;
  whyItMatters: string;
  actionLabel: string;
  hookType: "urgent" | "quick_win" | "money" | "postponed" | "important";
  priorityScore: number;
  autoFlow: AutoFlowItemSummary | null;
  status: "PENDING" | "OPENED_GUIDED";
  decisionTrace?: DecisionTrace;
}

export interface DailyPulseProgress {
  totalItems: number;
  completedCount: number;
  postponedCount: number;
  dismissedCount: number;
  remainingCount: number;
  progressPercent: number;
  isCompletedForNow: boolean;
  completedAt?: string | null;
}

export interface DailyPulseMomentum {
  handledThisWeek: number;
  todayCompleted: number;
  trend: "up" | "down" | "flat";
  completionMessage: string;
}

export interface DailyPulseResponse {
  generatedAt: string;
  topInsight: DailyPulseTopInsight;
  items: DailyPulseItem[];
  momentum: DailyPulseMomentum;
  progress: DailyPulseProgress;
  quickSummary: string;
  state: {
    date: string;
    openedAt?: string | null;
    totalItems: number;
    completedCount: number;
    postponedCount: number;
    dismissedCount: number;
    isCompletedForNow: boolean;
    completedAt?: string | null;
  };
}

export interface DailyPulseState {
  date: string;
  openedToday: boolean;
  openedAt?: string | null;
  totalItems: number;
  completedCount: number;
  postponedCount: number;
  dismissedCount: number;
  isCompletedForNow: boolean;
  completedAt?: string | null;
}

export interface DailyPulseItemUpdateResponse {
  obligationId: string;
  status: "PENDING" | "OPENED_GUIDED" | "COMPLETED" | "POSTPONED" | "DISMISSED";
  didChange: boolean;
  progress: DailyPulseProgress;
  momentum: DailyPulseMomentum;
}

export interface DailyPulseProgressResponse {
  progress: DailyPulseProgress;
  momentum: DailyPulseMomentum;
}

export type OutcomeSourceContext =
  | "TODAY_FEED"
  | "DASHBOARD_INSIGHT"
  | "DAILY_PULSE"
  | "GUIDED_MODE"
  | "OBLIGATION_DETAIL";

export type OutcomeType =
  | "FOLLOWED_RECOMMENDATION"
  | "CHOSE_DIFFERENT_OPTION"
  | "HELPFUL"
  | "NOT_HELPFUL"
  | "COMPLETED_SUCCESSFULLY"
  | "POSTPONED_INTENTIONALLY"
  | "DISMISSED_NOT_RELEVANT"
  | "ABANDONED"
  | "RECOMMENDATION_MISMATCH";

export interface OutcomeFeedbackEvent {
  id: string;
  sourceContext: OutcomeSourceContext;
  recommendationKey?: string | null;
  selectedActionKey: string;
  outcomeType: OutcomeType;
  note?: string | null;
  createdAt: string;
}

export interface PersonalizationSignals {
  subscriptionPreferenceBias: "cancel_leaning" | "keep_leaning" | "review_first" | "balanced";
  postponementPattern:
    | "none"
    | "commitments_often_postponed"
    | "renewals_often_postponed"
    | "low_importance_postponed"
    | "mixed";
  quickWinAffinity: "high" | "medium" | "low";
  urgencyResponsiveness: "high" | "medium" | "low";
  moneySensitivity: "act_now" | "review_first" | "low";
  journeyCompletionStyle: "usually_completes" | "often_abandons" | "alternative_leaning" | "mixed";
  reminderReliance: "high" | "medium" | "low";
}

export interface PersonalizationSummary {
  signals: PersonalizationSignals;
  lastUpdatedAt?: string | null;
}

export interface PersonalizationDebug extends PersonalizationSummary {
  influences: Array<{
    signal: keyof PersonalizationSignals;
    reason: string;
    metrics: Record<string, number | string>;
  }>;
}

export type MemoryEntityType = "VENDOR" | "SUBSCRIPTION" | "CATEGORY" | "OBLIGATION_TEMPLATE";
export type MemoryPatternType = "RECURRING_OBLIGATION" | "USER_BEHAVIOR" | "TIMING_PATTERN";

export interface MemoryEntity {
  id: string;
  type: MemoryEntityType;
  name: string;
  normalizedKey: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryPattern {
  id: string;
  patternType: MemoryPatternType;
  referenceId: string;
  patternData: Record<string, unknown> | null;
  confidence: number;
  frequency: number;
  lastObservedAt: string | null;
  isUserLocked: boolean;
  isSuppressed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryContext {
  currentFocus: string | null;
  recentActions: Array<Record<string, unknown>>;
  activeCategories: Array<Record<string, unknown>>;
  cognitiveLoadScore: number;
  updatedAt: string | null;
}

export interface MemorySummary {
  recurringPatterns: MemoryPattern[];
  behaviorProfile: {
    labels: string[];
    confidence: number;
    frequency: number;
  };
  currentContext: MemoryContext;
  topVendors: string[];
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
  outcomeFeedbackEvents: OutcomeFeedbackEvent[];
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
  why: WhyExplanation;
  decisionTrace?: DecisionTrace;
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

export type IngestionConfidenceBand = ConfidenceBand;

export interface IngestionExtractedFields {
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  title: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  recurrence: string | null;
  description: string | null;
}

export interface IngestionResult {
  importSourceId: string;
  candidateId: string | null;
  obligationId: string | null;
  status: "ACTIVE" | "DRAFT" | "NO_CANDIDATE" | "DUPLICATE";
  parseStatus:
    | "RECEIVED"
    | "PARTIAL"
    | "READY"
    | "NEEDS_CONFIRMATION"
    | "REJECTED"
    | "FAILED";
  confidence: number;
  confidenceBand: IngestionConfidenceBand;
  needsConfirmation: boolean;
  needsReview: boolean;
  isDuplicate: boolean;
  duplicateCandidate: boolean;
  conflictDetected: boolean;
  duplicateOfObligationId: string | null;
  conflictWithObligationId: string | null;
  extracted: IngestionExtractedFields;
}

export interface ObligationSourceDetails {
  obligationId: string;
  sourceType: TrustSourceType;
  sourceSubtype: "EMAIL_FORWARD" | "FILE_UPLOAD" | "COMMAND_CAPTURE" | null;
  parseStatus:
    | "RECEIVED"
    | "PARTIAL"
    | "READY"
    | "NEEDS_CONFIRMATION"
    | "REJECTED"
    | "FAILED"
    | null;
  parseConfidence: number | null;
  parserVersion: string | null;
  importedAt: string | null;
  extractionSummary?: Record<string, unknown> | null;
  provenanceLabel: string;
  rawData?: Record<string, unknown> | null;
}

export interface ReviewQueueItem extends Obligation {
  reviewReasons: string[];
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  pagination: {
    limit: number;
    total: number;
  };
}

export interface CommandExecuteResponse {
  resultType:
    | "today_feed"
    | "obligation_list"
    | "resolution_flow"
    | "new_obligation_candidate"
    | "ingestion_candidate"
    | "clarification";
  items?: TodayFeedItem[] | Obligation[];
  generatedAt?: string;
  obligationId?: string;
  recommendation?: ResolutionRecommendation;
  title?: string | null;
  ingestion?: IngestionResult;
  question?: string;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}
