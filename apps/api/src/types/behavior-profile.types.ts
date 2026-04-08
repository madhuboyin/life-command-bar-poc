import type {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  UserBehaviorProfile
} from "@prisma/client";

export const BEHAVIOR_SIGNAL_AUDIT_EVENT_TYPE = "behavior_signal_recorded" as const;

export const BEHAVIOR_SIGNAL_TYPES = [
  "ITEM_IMPRESSED",
  "ITEM_ACTED",
  "ITEM_DEFERRED",
  "ITEM_LEFT_UNTOUCHED",
  "DETAIL_OPENED",
  "WHY_THIS_OPENED",
  "REVIEW_STARTED",
  "REVIEW_COMPLETED"
] as const;

export type BehaviorSignalType = (typeof BEHAVIOR_SIGNAL_TYPES)[number];

export const BEHAVIOR_SIGNAL_ACTION_TYPES = [
  "KEEP",
  "CANCEL",
  "PAY",
  "CONFIRM",
  "REVIEW",
  "REMIND_LATER",
  "COMPLETE",
  "DISMISS"
] as const;

export type BehaviorSignalActionType = (typeof BEHAVIOR_SIGNAL_ACTION_TYPES)[number];

export type BehaviorSignalSource =
  | "TODAY_VIEW"
  | "DAILY_PULSE"
  | "OBLIGATION_ACTION"
  | "SUBSCRIPTION_REVIEW"
  | "OUTCOME_FEEDBACK"
  | "SYSTEM";

export type RecordBehaviorSignalInput = {
  userId: string;
  signalType: BehaviorSignalType;
  occurredAt?: Date;
  obligationId?: string | null;
  itemId?: string | null;
  sessionId?: string | null;
  category?: string | null;
  source?: BehaviorSignalSource;
  metadata?: Record<string, unknown>;
};

export type BehaviorSignalMetadata = {
  actionType?: BehaviorSignalActionType;
  timeToActionMs?: number | null;
  openedBeforeAction?: boolean;
  source?: BehaviorSignalSource;
  category?: string | null;
  sessionId?: string | null;
  itemId?: string | null;
  obligationId?: string | null;
  [key: string]: unknown;
};

export type BehaviorSignalRecord = {
  id: string;
  userId: string;
  signalType: BehaviorSignalType;
  occurredAt: Date;
  createdAt: Date;
  obligationId: string | null;
  itemId: string | null;
  sessionId: string | null;
  category: string | null;
  source: BehaviorSignalSource | null;
  metadata: BehaviorSignalMetadata;
};

export type BehaviorSignalSummary = {
  totalImpressions: number;
  totalActions: number;
  totalDefers: number;
  totalDetailOpens: number;
  totalWhyThisOpens: number;
  totalReviewStarts: number;
  totalReviewCompletions: number;
  directActionCount: number;
  reviewPathCount: number;
  decisionEventCount: number;
  timedActionSampleCount: number;
  quickTimedActionCount: number;
  medianTimeToActionMs: number | null;
  medianTimeToFirstActionMs: number | null;
  sampleSize: number;
};

export type BehaviorSignalWindowInput = {
  userId: string;
  windowStart?: Date;
  windowEnd?: Date;
  limit?: number;
};

export type BehaviorSignalSummaryRequest = BehaviorSignalWindowInput;

export type BehaviorSignalSummaryResult = {
  userId: string;
  sampleSize: number;
  signals: BehaviorSignalSummary;
  windowStart: Date | null;
  windowEnd: Date | null;
  totalSignals: number;
};

export type BehaviorProfileComputationInput = {
  userId: string;
  sampleSize: number;
  signals?: BehaviorSignalSummary;
  computedAt?: Date;
};

export type BehaviorProfileComputationReason = "INSUFFICIENT_DATA" | "COMPUTED";

export type BehaviorProfileComputationStatus =
  | BehaviorProfileComputationReason
  | "SKIPPED_NOT_NEEDED";

export type BehaviorProfileComputationDiagnostics = {
  sampleSize: number;
  decisionEventCount: number;
  timedActionSamples: number;
  quickActionRate: number | null;
  medianTimeToActionMs: number | null;
  medianTimeToFirstActionMs: number | null;
  detailOpenRate: number | null;
  reviewPathRate: number | null;
  deferRate: number | null;
  directActionRate: number | null;
};

export type ComputedBehaviorProfile = {
  actionSpeed: BehaviorActionSpeed;
  reviewPreference: BehaviorReviewPreference;
  deferFrequency: BehaviorDeferFrequency;
  signalSampleSize: number;
  computedAt: Date;
  reason: BehaviorProfileComputationReason;
  diagnostics?: BehaviorProfileComputationDiagnostics;
};

export type UnknownBehaviorProfileFallback = ComputedBehaviorProfile & {
  reason: "INSUFFICIENT_DATA";
};

export type BehaviorProfileSnapshot = Pick<
  UserBehaviorProfile,
  | "id"
  | "userId"
  | "actionSpeed"
  | "reviewPreference"
  | "deferFrequency"
  | "signalSampleSize"
  | "lastComputedAt"
  | "createdAt"
  | "updatedAt"
>;

export type BehaviorProfileRecomputeTrigger = {
  force?: boolean;
  observedSignalCountSinceLastCompute?: number;
  signalDeltaThreshold?: number;
  staleAfterHours?: number;
  now?: Date;
};

export type BehaviorProfileRecomputeReason =
  | "MISSING_PROFILE"
  | "MANUAL_TRIGGER"
  | "SIGNAL_DELTA_THRESHOLD_REACHED"
  | "PROFILE_STALE"
  | "SKIPPED_NOT_NEEDED";

export type BehaviorProfileRecomputeDecision = {
  shouldRecompute: boolean;
  reason: BehaviorProfileRecomputeReason;
};

export function buildEmptyBehaviorSignalSummary(): BehaviorSignalSummary {
  return {
    totalImpressions: 0,
    totalActions: 0,
    totalDefers: 0,
    totalDetailOpens: 0,
    totalWhyThisOpens: 0,
    totalReviewStarts: 0,
    totalReviewCompletions: 0,
    directActionCount: 0,
    reviewPathCount: 0,
    decisionEventCount: 0,
    timedActionSampleCount: 0,
    quickTimedActionCount: 0,
    medianTimeToActionMs: null,
    medianTimeToFirstActionMs: null,
    sampleSize: 0
  };
}
