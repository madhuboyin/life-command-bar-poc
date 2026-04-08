import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  type UserBehaviorProfile
} from "@prisma/client";
import { BehaviorProfileRepository } from "../repositories/behavior-profile.repository";
import { PersonalizationSignalService } from "./personalization-signal.service";
import type {
  BehaviorProfileComputationInput,
  BehaviorProfileComputationStatus,
  BehaviorProfileRecomputeDecision,
  BehaviorProfileRecomputeTrigger,
  BehaviorProfileSnapshot,
  BehaviorSignalSummary,
  ComputedBehaviorProfile,
  UnknownBehaviorProfileFallback
} from "../types/behavior-profile.types";

const MIN_COMPUTE_SAMPLE_SIZE = 20;
const STRONG_SIGNAL_SAMPLE_SIZE = 40;
const DEFAULT_STALE_AFTER_HOURS = 24;
const DEFAULT_SIGNAL_DELTA_THRESHOLD = 25;

const FAST_ACTION_MEDIAN_THRESHOLD_MS = 15 * 60 * 1000;
const SLOW_ACTION_MEDIAN_THRESHOLD_MS = 45 * 60 * 1000;

const REVIEW_FIRST_SIGNAL_RATIO_THRESHOLD = 0.45;
const QUICK_ACTION_SIGNAL_RATIO_THRESHOLD = 0.15;

const HIGH_DEFER_RATIO_THRESHOLD = 0.4;
const LOW_DEFER_RATIO_THRESHOLD = 0.2;

type BehaviorProfileServiceDependencies = {
  repository?: BehaviorProfileRepository;
  signalService?: PersonalizationSignalService;
  now?: () => Date;
};

export type RecomputeBehaviorProfileResult = {
  profile: BehaviorProfileSnapshot;
  computedProfile: ComputedBehaviorProfile;
  status: BehaviorProfileComputationStatus;
  recomputeDecision: BehaviorProfileRecomputeDecision;
};

export class BehaviorProfileService {
  private readonly repository: BehaviorProfileRepository;
  private readonly signalService: PersonalizationSignalService;
  private readonly now: () => Date;

  constructor(dependencies: BehaviorProfileServiceDependencies = {}) {
    this.repository = dependencies.repository ?? new BehaviorProfileRepository();
    this.signalService =
      dependencies.signalService ?? new PersonalizationSignalService();
    this.now = dependencies.now ?? (() => new Date());
  }

  async getBehaviorProfile(userId: string) {
    const profile = await this.repository.getByUserId(userId);
    return profile ? mapProfile(profile) : null;
  }

  async getOrCreateBehaviorProfile(userId: string) {
    const profile = await this.repository.getOrCreateByUserId(userId);
    return mapProfile(profile);
  }

  buildUnknownProfileFallback(
    _userId: string,
    input?: {
      sampleSize?: number;
      computedAt?: Date;
    }
  ): UnknownBehaviorProfileFallback {
    return {
      actionSpeed: BehaviorActionSpeed.UNKNOWN,
      reviewPreference: BehaviorReviewPreference.UNKNOWN,
      deferFrequency: BehaviorDeferFrequency.UNKNOWN,
      signalSampleSize: sanitizeSampleSize(input?.sampleSize ?? 0),
      computedAt: input?.computedAt ?? this.now(),
      reason: "INSUFFICIENT_DATA"
    };
  }

  async computeBehaviorProfile(
    input: BehaviorProfileComputationInput
  ): Promise<ComputedBehaviorProfile> {
    const computedAt = input.computedAt ?? this.now();
    const sampleSize = sanitizeSampleSize(input.sampleSize);

    if (sampleSize < MIN_COMPUTE_SAMPLE_SIZE || !input.signals) {
      return this.buildUnknownProfileFallback(input.userId, {
        sampleSize,
        computedAt
      });
    }

    // Placeholder deterministic rules for Step 1.
    // Future phases can refine thresholds and add richer aggregation inputs
    // without changing this service contract.
    const actionSpeed = inferActionSpeed(input.signals, sampleSize);
    const reviewPreference = inferReviewPreference(input.signals, sampleSize);
    const deferFrequency = inferDeferFrequency(input.signals, sampleSize);

    return {
      actionSpeed,
      reviewPreference,
      deferFrequency,
      signalSampleSize: sampleSize,
      computedAt,
      reason: "COMPUTED"
    };
  }

  shouldRecomputeProfile(
    existingProfile: BehaviorProfileSnapshot | UserBehaviorProfile | null,
    context?: BehaviorProfileRecomputeTrigger
  ): BehaviorProfileRecomputeDecision {
    if (!existingProfile) {
      return {
        shouldRecompute: true,
        reason: "MISSING_PROFILE"
      };
    }

    if (context?.force) {
      return {
        shouldRecompute: true,
        reason: "MANUAL_TRIGGER"
      };
    }

    const signalDeltaThreshold =
      context?.signalDeltaThreshold ?? DEFAULT_SIGNAL_DELTA_THRESHOLD;
    if (
      (context?.observedSignalCountSinceLastCompute ?? 0) >= signalDeltaThreshold
    ) {
      return {
        shouldRecompute: true,
        reason: "SIGNAL_DELTA_THRESHOLD_REACHED"
      };
    }

    const now = context?.now ?? this.now();
    const staleAfterHours = context?.staleAfterHours ?? DEFAULT_STALE_AFTER_HOURS;
    const staleAfterMs = staleAfterHours * 60 * 60 * 1000;

    if (!existingProfile.lastComputedAt) {
      return {
        shouldRecompute: true,
        reason: "PROFILE_STALE"
      };
    }

    if (now.getTime() - existingProfile.lastComputedAt.getTime() >= staleAfterMs) {
      return {
        shouldRecompute: true,
        reason: "PROFILE_STALE"
      };
    }

    return {
      shouldRecompute: false,
      reason: "SKIPPED_NOT_NEEDED"
    };
  }

  async recomputeBehaviorProfile(
    userId: string,
    input?: BehaviorProfileComputationInput,
    trigger?: BehaviorProfileRecomputeTrigger
  ): Promise<RecomputeBehaviorProfileResult> {
    const existingProfile = await this.repository.getByUserId(userId);
    const recomputeDecision = this.shouldRecomputeProfile(existingProfile, trigger);

    if (!recomputeDecision.shouldRecompute && existingProfile) {
      return {
        profile: mapProfile(existingProfile),
        computedProfile: mapPersistedToComputedProfile(existingProfile),
        status: "SKIPPED_NOT_NEEDED",
        recomputeDecision
      };
    }

    const computationInput =
      input ??
      (await this.signalService.buildComputationInput({
        userId
      }));
    const computedProfile = await this.computeBehaviorProfile({
      ...computationInput,
      userId
    });

    const profile = await this.repository.upsertComputedProfile(
      userId,
      computedProfile
    );

    return {
      profile: mapProfile(profile),
      computedProfile,
      status: computedProfile.reason,
      recomputeDecision
    };
  }
}

function inferActionSpeed(
  signals: BehaviorSignalSummary,
  sampleSize: number
): BehaviorActionSpeed {
  // Future rule target:
  // - Use robust time-to-first-action windows split by obligation type/risk.
  // - Require stability checks over rolling windows to avoid noisy toggling.
  if (
    sampleSize < STRONG_SIGNAL_SAMPLE_SIZE ||
    signals.medianTimeToFirstActionMs === null
  ) {
    return BehaviorActionSpeed.UNKNOWN;
  }

  if (signals.medianTimeToFirstActionMs <= FAST_ACTION_MEDIAN_THRESHOLD_MS) {
    return BehaviorActionSpeed.FAST;
  }

  if (signals.medianTimeToFirstActionMs >= SLOW_ACTION_MEDIAN_THRESHOLD_MS) {
    return BehaviorActionSpeed.SLOW;
  }

  return BehaviorActionSpeed.UNKNOWN;
}

function inferReviewPreference(
  signals: BehaviorSignalSummary,
  sampleSize: number
): BehaviorReviewPreference {
  // Future rule target:
  // - Compare detail/review interactions against eventual action outcomes.
  // - Incorporate confidence bands to avoid overfitting sparse behavior.
  if (sampleSize < STRONG_SIGNAL_SAMPLE_SIZE || signals.totalActions <= 0) {
    return BehaviorReviewPreference.UNKNOWN;
  }

  const reviewSignals =
    signals.detailOpenCount +
    signals.whyThisOpenCount +
    signals.reviewStartCount +
    signals.reviewCompleteCount;
  const reviewRatio = reviewSignals / signals.totalActions;

  if (reviewRatio >= REVIEW_FIRST_SIGNAL_RATIO_THRESHOLD) {
    return BehaviorReviewPreference.REVIEW_FIRST;
  }

  if (reviewRatio <= QUICK_ACTION_SIGNAL_RATIO_THRESHOLD) {
    return BehaviorReviewPreference.QUICK_ACTION;
  }

  return BehaviorReviewPreference.UNKNOWN;
}

function inferDeferFrequency(
  signals: BehaviorSignalSummary,
  sampleSize: number
): BehaviorDeferFrequency {
  // Future rule target:
  // - Weight defer behavior by urgency and consequence category.
  // - Use guardrails to avoid classifying users from transient streaks.
  if (sampleSize < STRONG_SIGNAL_SAMPLE_SIZE || signals.totalImpressions <= 0) {
    return BehaviorDeferFrequency.UNKNOWN;
  }

  const deferRatio = signals.totalDefers / signals.totalImpressions;
  if (deferRatio >= HIGH_DEFER_RATIO_THRESHOLD) {
    return BehaviorDeferFrequency.HIGH;
  }

  if (deferRatio <= LOW_DEFER_RATIO_THRESHOLD) {
    return BehaviorDeferFrequency.LOW;
  }

  return BehaviorDeferFrequency.UNKNOWN;
}

function sanitizeSampleSize(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function mapProfile(profile: UserBehaviorProfile): BehaviorProfileSnapshot {
  return {
    id: profile.id,
    userId: profile.userId,
    actionSpeed: profile.actionSpeed,
    reviewPreference: profile.reviewPreference,
    deferFrequency: profile.deferFrequency,
    signalSampleSize: profile.signalSampleSize,
    lastComputedAt: profile.lastComputedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}

function mapPersistedToComputedProfile(
  profile: UserBehaviorProfile
): ComputedBehaviorProfile {
  return {
    actionSpeed: profile.actionSpeed,
    reviewPreference: profile.reviewPreference,
    deferFrequency: profile.deferFrequency,
    signalSampleSize: profile.signalSampleSize,
    computedAt: profile.lastComputedAt ?? profile.updatedAt,
    reason:
      profile.signalSampleSize >= MIN_COMPUTE_SAMPLE_SIZE &&
      profile.lastComputedAt !== null
        ? "COMPUTED"
        : "INSUFFICIENT_DATA"
  };
}
