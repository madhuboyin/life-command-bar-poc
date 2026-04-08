import type {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  UserBehaviorProfile
} from "@prisma/client";

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

export type BehaviorSignalInput = {
  userId: string;
  signalType: BehaviorSignalType;
  occurredAt: Date;
  obligationId?: string | null;
  metadata?: Record<string, unknown>;
};

export type BehaviorSignalSummary = {
  totalImpressions: number;
  totalActions: number;
  totalDefers: number;
  totalLeftUntouched: number;
  detailOpenCount: number;
  whyThisOpenCount: number;
  reviewStartCount: number;
  reviewCompleteCount: number;
  medianTimeToActionMs: number | null;
  medianTimeToFirstActionMs: number | null;
};

export type BehaviorSignalSummaryRequest = {
  userId: string;
  windowStart?: Date;
  windowEnd?: Date;
};

export type BehaviorSignalSummaryResult = {
  userId: string;
  sampleSize: number;
  signals: BehaviorSignalSummary;
  windowStart: Date | null;
  windowEnd: Date | null;
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

export type ComputedBehaviorProfile = {
  actionSpeed: BehaviorActionSpeed;
  reviewPreference: BehaviorReviewPreference;
  deferFrequency: BehaviorDeferFrequency;
  signalSampleSize: number;
  computedAt: Date;
  reason: BehaviorProfileComputationReason;
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
    totalLeftUntouched: 0,
    detailOpenCount: 0,
    whyThisOpenCount: 0,
    reviewStartCount: 0,
    reviewCompleteCount: 0,
    medianTimeToActionMs: null,
    medianTimeToFirstActionMs: null
  };
}
