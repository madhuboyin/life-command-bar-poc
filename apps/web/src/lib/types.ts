export interface Obligation {
  id: string;
  userId: string;
  scopeType: "PERSONAL" | "HOUSEHOLD";
  householdId?: string | null;
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  lastHandledByUserId?: string | null;
  assignee?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  createdBy?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  lastHandledBy?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
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
  subscriptionId?: string | null;
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
  sourceSubtype: "EMAIL_FORWARD" | "GMAIL_READONLY" | "FILE_UPLOAD" | "COMMAND_CAPTURE" | null;
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
  | "commitments"
  | "assigned_to_me"
  | "unassigned"
  | "household"
  | "personal";

export type ObligationSort = "due_date" | "importance" | "urgency" | "created_at" | "amount";
export type SortDirection = "asc" | "desc";

export interface DashboardInsightCard {
  key:
    | "attention"
    | "relief"
    | "quick_wins"
    | "money_exposure"
    | "postponed"
    | "open_category"
    | "upcoming_prediction";
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
  upcomingPredictions?: PredictionSummaryItem[];
  subscriptionSignals?: {
    summaryLine: string | null;
    renewingSoonCount: number;
    priceIncreasedCount: number;
    needsReviewCount: number;
    items: Array<{
      subscriptionId: string;
      title: string;
      insightType: string;
      insightTitle: string;
      severity: "HIGH" | "MEDIUM" | "LOW";
      recommendationType: string;
      healthScore: number;
      nextRenewalDate: string | null;
    }>;
  };
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

export type PredictionType =
  | "RECURRING_NEXT_OCCURRENCE"
  | "UPCOMING_ATTENTION"
  | "WORKLOAD_WINDOW"
  | "MISSING_EXPECTED_OBLIGATION";

export type PredictionReferenceType = "MEMORY_PATTERN" | "MEMORY_ENTITY" | "OBLIGATION" | "VENDOR";
export type PredictionStatus =
  | "ACTIVE"
  | "CONFIRMED"
  | "DISMISSED"
  | "EXPIRED"
  | "PROMOTED_TO_OBLIGATION";

export interface PredictionSummaryItem {
  id: string;
  title: string;
  description: string | null;
  predictedDate: string | null;
  confidenceBand: ConfidenceBand;
  rationaleSummary: string | null;
}

export interface PredictionItem extends PredictionSummaryItem {
  predictionType: PredictionType;
  referenceType: PredictionReferenceType;
  referenceId: string;
  predictionWindowStart: string | null;
  predictionWindowEnd: string | null;
  confidenceScore: number;
  status: PredictionStatus;
  rationale: Record<string, unknown> | null;
  sourceReference: {
    referenceType: PredictionReferenceType;
    referenceId: string;
    matchedVendor: string | null;
    obligationType: string | null;
  };
  promotedObligationId: string | null;
  promotedObligation: Obligation | null;
  needsConfirmation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PredictionListResponse {
  items: PredictionItem[];
}

export interface PredictionUpcomingResponse {
  windows: Array<{
    windowDays: number;
    start: string;
    end: string;
    items: PredictionItem[];
  }>;
  items: PredictionItem[];
}

export interface ControlTowerReviewItem {
  id: string;
  itemType: "OBLIGATION" | "PREDICTION";
  obligationId: string | null;
  predictionId: string | null;
  title: string;
  description: string | null;
  sourceLabel: string;
  confidenceBand: ConfidenceBand;
  confidenceScore: number;
  reviewReasons: string[];
  extractedFields: Record<string, unknown> | null;
  predictedDate: string | null;
  status: string;
  why: WhyExplanation;
}

export interface ControlTowerReadyItem {
  id: string;
  obligationId: string;
  autoFlowId: string | null;
  title: string;
  sourceLabel: string;
  confidenceBand: ConfidenceBand;
  confidenceScore: number;
  priorityScore: number;
  reason: string;
  ctaLabel: string;
  why: WhyExplanation;
}

export interface ControlTowerApprovalItem {
  id: string;
  decisionId: string;
  title: string;
  description: string | null;
  candidateAction:
    | "CREATE_DRAFT_FROM_INGESTION"
    | "PROMOTE_RECURRING_PREDICTION"
    | "AUTO_CREATE_REMINDER"
    | "PREPARE_AUTO_FLOW"
    | "SUPPRESS_DUPLICATE"
    | "AUTO_REFRESH_SURFACES";
  sourceLabel: string;
  confidenceBand: ConfidenceBand;
  confidenceScore: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "NONE" | "UNDONE";
  obligationId: string | null;
  predictionId: string | null;
  reminderId: string | null;
  rationaleSummary: string | null;
  createdAt: string;
  why: WhyExplanation;
}

export interface ControlTowerUpcomingItem {
  id: string;
  predictionId: string;
  obligationId: string | null;
  title: string;
  description: string | null;
  predictedDate: string | null;
  confidenceBand: ConfidenceBand;
  confidenceScore: number;
  predictionType: PredictionType;
  status: PredictionStatus;
  rationaleSummary: string | null;
  sourceLabel: string;
  why: WhyExplanation;
}

export interface ControlTowerRecentItem {
  id: string;
  eventType: string;
  obligationId: string | null;
  title: string;
  description: string;
  createdAt: string;
  outcomeLabel: string;
  sourceLabel: string;
}

export interface ControlTowerSystemDecisionItem {
  id: string;
  decisionType: "SUPPRESSION" | "DUPLICATE" | "AUTO_FLOW" | "PREDICTION" | "CONFIDENCE" | "ROUTING";
  title: string;
  explanation: string;
  sourceSignals: string[];
  createdAt: string;
  obligationId: string | null;
  referenceId: string | null;
}

export interface ControlTowerUpcomingSection {
  windows: Array<{
    windowDays: number;
    start: string;
    end: string;
    items: ControlTowerUpcomingItem[];
  }>;
  items: ControlTowerUpcomingItem[];
}

export interface ControlTowerResponse {
  generatedAt: string;
  review: ControlTowerReviewItem[];
  approvals: ControlTowerApprovalItem[];
  ready: ControlTowerReadyItem[];
  upcoming: ControlTowerUpcomingSection;
  recent: ControlTowerRecentItem[];
  systemDecisions: ControlTowerSystemDecisionItem[];
  subscriptionOptimization: {
    renewingSoon: ControlTowerSubscriptionOptimizationItem[];
    priceIncreased: ControlTowerSubscriptionOptimizationItem[];
    potentiallyUnused: ControlTowerSubscriptionOptimizationItem[];
    needsReview: ControlTowerSubscriptionOptimizationItem[];
  };
  summary: {
    reviewCount: number;
    approvalCount: number;
    readyCount: number;
    upcomingCount: number;
    recentCount: number;
    systemDecisionCount: number;
    subscriptionOptimizationCount: number;
  };
}

export interface ControlTowerSubscriptionOptimizationItem {
  id: string;
  subscriptionId: string;
  title: string;
  vendorName: string;
  lifecycleState: string;
  recurringPrice: number | null;
  currency: string | null;
  nextRenewalDate: string | null;
  healthScore: number;
  healthBand: "GOOD" | "FAIR" | "AT_RISK";
  insightType: string;
  insightTitle: string;
  insightDescription: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  recommendationType: string;
  recommendationReason: string;
  recommendedAction: string;
  ctaLabel: string;
}

export type SubscriptionLifecycleState =
  | "DISCOVERED"
  | "TRIALING"
  | "ACTIVE"
  | "RENEWING"
  | "PRICE_CHANGED"
  | "CANCELING"
  | "CANCELED"
  | "ENDED"
  | "INACTIVE"
  | "UNKNOWN";

export type SubscriptionBillingPeriod =
  | "MONTHLY"
  | "YEARLY"
  | "QUARTERLY"
  | "WEEKLY"
  | "UNKNOWN";

export type SubscriptionAutoRenewStatus = "ON" | "OFF" | "UNKNOWN";

export interface SubscriptionOptimizationHealth {
  score: number;
  band: "GOOD" | "FAIR" | "AT_RISK";
  rationale: string[];
}

export interface SubscriptionOptimizationInsight {
  id: string;
  subscriptionId: string;
  insightType:
    | "PRICE_INCREASE"
    | "RENEWAL_UPCOMING"
    | "UNUSED_RISK"
    | "LOW_CONFIDENCE"
    | "CANCELLATION_CONFIRMED"
    | "DUPLICATE_SUBSCRIPTION"
    | "PLAN_MISMATCH"
    | "UNKNOWN_STATE";
  title: string;
  description: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  metadata: Record<string, unknown> | null;
  recommendedAction: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SubscriptionOptimizationRecommendation {
  subscriptionId: string;
  recommendationType: "KEEP" | "REVIEW" | "CANCEL" | "DOWNGRADE" | "CONFIRM" | "IGNORE";
  reason: string;
  confidence: number;
  supportingInsights: SubscriptionOptimizationInsight["insightType"][];
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionOptimizationRecord {
  subscriptionId: string;
  health: SubscriptionOptimizationHealth;
  insights: SubscriptionOptimizationInsight[];
  recommendation: SubscriptionOptimizationRecommendation;
}

export interface SubscriptionRegistrySummary {
  id: string;
  userId: string;
  scopeType: "PERSONAL" | "HOUSEHOLD";
  householdId: string | null;
  assignedToUserId: string | null;
  createdByUserId: string | null;
  lastHandledByUserId: string | null;
  assignedTo: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  vendorName: string;
  vendorNormalizedKey: string;
  planName: string | null;
  subscriptionTitle: string;
  category: string | null;
  lifecycleState: SubscriptionLifecycleState;
  billingPeriod: SubscriptionBillingPeriod;
  recurringPrice: number | null;
  currency: string | null;
  introPrice: number | null;
  amountLastCharged: number | null;
  autoRenewStatus: SubscriptionAutoRenewStatus;
  trialEndDate: string | null;
  nextRenewalDate: string | null;
  lastChargedDate: string | null;
  cancellationEffectiveDate: string | null;
  sourceConfidenceScore: number;
  sourceConfidenceBand: ConfidenceBand;
  optimization: SubscriptionOptimizationRecord | null;
  counts: {
    evidence: number;
    lifecycleEvents: number;
    priceHistory: number;
    linkedObligations: number;
    insights: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionEvidenceItem {
  id: string;
  sourceType: "GMAIL" | "UPLOAD" | "COMMAND" | "MANUAL" | "PREDICTION";
  sourceSubType:
    | "WELCOME_EMAIL"
    | "RENEWAL_EMAIL"
    | "RECEIPT_EMAIL"
    | "CANCELLATION_EMAIL"
    | "MANUAL_CONFIRMATION"
    | "REVIEW_CONFIRMATION"
    | null;
  referenceType: "IMPORT_SOURCE" | "OBLIGATION" | "PREDICTION" | "MEMORY_PATTERN" | "EXTERNAL_MESSAGE";
  referenceId: string;
  signalSummary: Record<string, unknown> | null;
  confidenceScore: number;
  observedAt: string;
  createdAt: string;
}

export interface SubscriptionLifecycleEventItem {
  id: string;
  eventType:
    | "DISCOVERED"
    | "TRIAL_STARTED"
    | "ACTIVATED"
    | "RENEWAL_DETECTED"
    | "RECEIPT_CAPTURED"
    | "PRICE_CHANGED"
    | "AUTO_RENEW_ON"
    | "AUTO_RENEW_OFF"
    | "CANCELLATION_DETECTED"
    | "CANCELED"
    | "REACTIVATED"
    | "MERGED"
    | "CORRECTED";
  previousState: SubscriptionLifecycleState | null;
  nextState: SubscriptionLifecycleState | null;
  eventDate: string | null;
  metadata: Record<string, unknown> | null;
  sourceEvidenceId: string | null;
  createdAt: string;
}

export interface SubscriptionPriceHistoryItem {
  id: string;
  priceType: "INTRO" | "RECURRING" | "CHARGED";
  amount: number;
  currency: string;
  billingPeriod: SubscriptionBillingPeriod | null;
  effectiveDate: string | null;
  sourceEvidenceId: string | null;
  createdAt: string;
}

export interface SubscriptionLinkedObligationItem {
  id: string;
  title: string;
  status: Obligation["status"];
  type: Obligation["type"];
  dueDate: string | null;
  amount: number | null;
  currency: string | null;
  updatedAt: string;
}

export interface SubscriptionRegistryDetail extends SubscriptionRegistrySummary {
  createdBy: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  lastHandledBy: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  evidence: SubscriptionEvidenceItem[];
  lifecycleEvents: SubscriptionLifecycleEventItem[];
  priceHistory: SubscriptionPriceHistoryItem[];
  linkedObligations: SubscriptionLinkedObligationItem[];
}

export interface SubscriptionRegistryListResponse {
  items: SubscriptionRegistrySummary[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface SubscriptionGuidedFlow {
  flowId: string;
  subscriptionId: string;
  title: string;
  recommendedDecision: "KEEP" | "REVIEW" | "CANCEL" | "DOWNGRADE" | "CONFIRM" | "IGNORE";
  steps: Array<{
    key: string;
    title: string;
    description: string;
    options: Array<{
      key: string;
      label: string;
      description: string;
      recommended?: boolean;
    }>;
  }>;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  slug: string | null;
  createdByUserId: string;
  createdBy: {
    id: string;
    email: string;
    name: string | null;
  };
  memberCount: number;
  myRole: "OWNER" | "MEMBER" | null;
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  role: "OWNER" | "MEMBER";
  status: "ACTIVE" | "INVITED" | "REMOVED";
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdInvite {
  id: string;
  householdId: string;
  invitedEmail: string;
  invitedByUserId: string;
  role: "OWNER" | "MEMBER";
  token: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  acceptedAt: string | null;
}

export interface HouseholdPulseItem {
  obligationId: string;
  title: string;
  dueDate: string | null;
  status: string;
  priorityScore: number;
  scopeType: "HOUSEHOLD";
  assignment: {
    state: "MINE" | "ASSIGNED" | "UNASSIGNED";
    assignedToUserId: string | null;
    assignedToName: string | null;
  };
  whyShown: string;
  sourceType: string;
  confidenceBand: ConfidenceBand;
  needsReview: boolean;
}

export interface HouseholdPulseResponse {
  generatedAt: string;
  householdId: string;
  items: HouseholdPulseItem[];
  summary: {
    totalOpen: number;
    assignedToMeCount: number;
    unassignedCount: number;
    urgentCount: number;
  };
}

export interface HouseholdControlTowerResponse {
  generatedAt: string;
  householdId: string;
  review: HouseholdPulseItem[];
  ready: HouseholdPulseItem[];
  approvals: Array<{
    id: string;
    title: string;
    candidateAction: string;
    confidenceScore: number;
    status: string;
    createdAt: string;
  }>;
  upcoming: Array<{
    id: string;
    title: string;
    predictedDate: string | null;
    confidenceBand: ConfidenceBand;
    rationaleSummary: string | null;
  }>;
  recent: Array<{
    id: string;
    eventType: string;
    createdAt: string;
    obligationId: string | null;
    actorUserId: string;
  }>;
  summary: {
    reviewCount: number;
    readyCount: number;
    approvalCount: number;
    upcomingCount: number;
    recentCount: number;
  };
}

export type ZeroInputAutonomyTier = "OBSERVE_ONLY" | "PREPARE_ONLY" | "SAFE_AUTOMATION";

export interface ZeroInputPolicy {
  id: string;
  userId: string;
  modeEnabled: boolean;
  autonomyTier: ZeroInputAutonomyTier;
  allowRecurringPromotion: boolean;
  allowReminderAutocreate: boolean;
  allowDuplicateSuppression: boolean;
  allowAutoFlowPreparation: boolean;
  allowPredictionPromotion: boolean;
  requireApprovalForFinancialItems: boolean;
  requireApprovalForLowConfidence: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ZeroInputDecisionType = "EXECUTED" | "REVIEW" | "APPROVAL_REQUIRED" | "SUPPRESSED";
export type ZeroInputApprovalStatus =
  | "NONE"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "UNDONE";

export type ZeroInputActionType =
  | "CREATE_DRAFT_FROM_INGESTION"
  | "PROMOTE_RECURRING_PREDICTION"
  | "AUTO_CREATE_REMINDER"
  | "PREPARE_AUTO_FLOW"
  | "SUPPRESS_DUPLICATE"
  | "AUTO_REFRESH_SURFACES";

export interface ZeroInputDecisionItem {
  id: string;
  title: string;
  description: string | null;
  sourceType: string;
  referenceType: string;
  referenceId: string | null;
  candidateAction: ZeroInputActionType;
  decision: ZeroInputDecisionType;
  approvalStatus: ZeroInputApprovalStatus;
  confidenceScore: number;
  confidenceBand: ConfidenceBand;
  rationale: Record<string, unknown> | null;
  guardrailResults: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  obligationId: string | null;
  predictionId: string | null;
  reminderId: string | null;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  undoneAt: string | null;
  undoReason: string | null;
  canApprove: boolean;
  canReject: boolean;
  canUndo: boolean;
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
  autonomyDecisions: Array<{
    id: string;
    candidateAction: ZeroInputActionType;
    decision: ZeroInputDecisionType;
    approvalStatus: ZeroInputApprovalStatus;
    title: string;
    description: string | null;
    confidenceScore: number;
    createdAt: string;
    executedAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    undoneAt: string | null;
    undoReason: string | null;
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
  sourceSubtype: "EMAIL_FORWARD" | "GMAIL_READONLY" | "FILE_UPLOAD" | "COMMAND_CAPTURE" | null;
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

export interface GmailConnectionStatus {
  id: string;
  provider: "GOOGLE_GMAIL";
  email: string;
  scope: string;
  status: "ACTIVE" | "DISCONNECTED" | "ERROR";
  errorCode: string | null;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  lastHistoryId: string | null;
  lastProcessedMessageId: string | null;
  lastProcessedMessageDate: string | null;
  lastSyncStatus: "IDLE" | "RUNNING" | "COMPLETED" | "ERROR" | null;
  lastSyncWindowDays: number | null;
  lastSyncMatchedCount: number;
  lastSyncIngestedCount: number;
  lastSyncDuplicateCount: number;
  lastSyncErrorCount: number;
  autoSyncEnabled: boolean;
  scanSubscriptions: boolean;
  scanBills: boolean;
  scanRenewals: boolean;
  includeRecurringReceipts: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GmailSyncResult {
  mode: "INITIAL_BACKFILL" | "MANUAL_RESYNC" | "INCREMENTAL";
  windowDays: 30 | 90 | 365;
  queries: Array<{
    key: string;
    query: string;
    matched: number;
  }>;
  stats: {
    matchedMessages: number;
    fetchedMessages: number;
    ingestedCandidates: number;
    reviewRouted: number;
    duplicateSuppressed: number;
    errors: number;
    skippedAlreadyProcessed: number;
  };
  lastProcessedMessageId: string | null;
  lastProcessedMessageDate: string | null;
  completedAt: string;
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

export type AdminTimeBucket = "DAY" | "WEEK" | "MONTH";

export interface AdminPeriodMetrics {
  bucket: AdminTimeBucket;
  window: {
    start: string;
    end: string;
  };
  systemHealth: {
    ingestionVolume: number;
    predictionVolume: number;
    autoFlowVolume: number;
  };
  ingestionQuality: {
    totalIngestions: number;
    highConfidenceRate: number;
    mediumConfidenceRate: number;
    lowConfidenceRate: number;
    correctedRate: number;
    rejectedRate: number;
    duplicateRate: number;
  };
  predictionAccuracy: {
    confirmedRate: number;
    dismissedRate: number;
    promotedRate: number;
    confidenceOutcomeCorrelation: number;
  };
  automationPerformance: {
    acceptedRate: number;
    dismissedRate: number;
    ignoredRate: number;
    avgTimeToActionMinutes: number;
    autonomySuccessRate: number;
  };
  executionLayer: {
    guidedCompletionRate: number;
    guidedDropOffRate: number;
    avgStepsPerSession: number;
    stepDropOff: Array<{
      stepKey: string;
      completionRate: number;
      completedCount: number;
    }>;
  };
  trustAndCorrection: {
    correctionsPerSession: number;
    reviewQueueSize: number;
    approvalQueueSize: number;
    rejectionRate: number;
    correctionRate: number;
  };
  householdMetrics: {
    collaborationEfficiency: number;
    assignmentBalance: number;
    assignmentMismatchRate: number;
    reassignmentFrequency: number;
    unclaimedItemsRate: number;
  };
  autonomySafety: {
    totalAutoActions: number;
    undoneRate: number;
    overriddenRate: number;
    requiringApprovalRate: number;
  };
  llmOptimization: {
    totalRequests: number;
    executedCalls: number;
    cacheHitRate: number;
    gateSkipRate: number;
    failureRate: number;
    avgLatencyMs: number;
    estimatedCostUsd: number;
    asyncEnqueued: number;
    resolvedWithoutProviderRate: number;
    lowCostTierRate: number;
    reasoningTierRate: number;
    premiumTierRate: number;
    gmailFallbackRate: number;
  };
  qualityScores: {
    ingestionQualityScore: number;
    predictionAccuracyScore: number;
    automationEffectivenessScore: number;
    trustScore: number;
  };
}

export interface AdminMetricsOverviewResponse {
  generatedAt: string;
  periods: {
    day: AdminPeriodMetrics;
    week: AdminPeriodMetrics;
    month: AdminPeriodMetrics;
  };
  qualityScores: AdminPeriodMetrics["qualityScores"];
}

export interface AdminMetricSeriesResponse {
  metricType: string;
  timeBucket: AdminTimeBucket;
  points: Array<{
    timestamp: string;
    value: number;
    dimension?: Record<string, unknown> | null;
  }>;
}

export interface AdminMetricTrendsResponse {
  timeBucket: AdminTimeBucket;
  trends: Array<{
    metricType: string;
    points: Array<{
      timestamp: string;
      value: number;
    }>;
  }>;
}

export interface AdminObservabilityEvent {
  id: string;
  userId: string | null;
  householdId: string | null;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  metadata?: Record<string, unknown> | null;
  traceId: string | null;
  correlationId: string | null;
  sourceAuditEventId: string | null;
  timestamp: string;
}

export interface AdminObservabilityEventsResponse {
  items: AdminObservabilityEvent[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface AdminAlertItem {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  description: string;
  metricType: string;
  currentValue: number;
  baselineValue: number | null;
  threshold: number;
  timestamp: string;
}

export interface AdminAlertsResponse {
  generatedAt: string;
  alerts: AdminAlertItem[];
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface SubscriptionReviewItem {
  subscriptionId: string;
  title: string;
  vendorName: string;
  planName: string | null;
  lifecycleState: SubscriptionLifecycleState | "REVIEW";
  recurringPrice: number | null;
  currency: string | null;
  nextRenewalDate: string | null;
  recommendationType: string;
  recommendationReason: string;
  healthScore: number;
  confidenceBand: string;
  primaryInsight: string | null;
  assignee: string | null;
  scopeType: "PERSONAL" | "HOUSEHOLD";
}

export interface SubscriptionReviewGroup {
  key: string;
  title: string;
  description: string;
  items: SubscriptionReviewItem[];
}

export interface SubscriptionReviewSummary {
  totalReviewItems: number;
  renewingSoonCount: number;
  priceIncreasedCount: number;
  needsConfirmationCount: number;
  potentialSavingsAmount: number;
  currency: string;
}

export interface SubscriptionReviewHubData {
  summary: SubscriptionReviewSummary;
  groups: SubscriptionReviewGroup[];
}

export interface SubscriptionDecisionFlowData {
  subscription: {
    id: string;
    title: string;
    vendorName: string;
    planName: string | null;
    lifecycleState: string;
    recurringPrice: number | null;
    currency: string | null;
    nextRenewalDate: string | null;
    confidenceBand: string;
    healthScore: number;
  };
  recommendation: {
    type: string;
    reason: string;
    confidence: number;
    supportingInsights: string[];
  };
  decisionContext: {
    whatChanged: string;
    whyNow: string;
    riskLevel: string;
    sourceSummary: string;
  };
  actions: Array<{ key: string; label: string }>;
  detailSections: {
    priceHistory: Array<any>;
    evidenceSummary: Array<{ title: string; desc: string }>;
    lifecycleTimeline: Array<any>;
  };
}
