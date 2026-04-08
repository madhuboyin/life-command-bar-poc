import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  Prisma,
  type UserBehaviorProfile
} from "@prisma/client";
import { createAuditEvent } from "../observability/audit-event";
import { BehaviorProfileRepository } from "../repositories/behavior-profile.repository";
import { PersonalizationSignalService } from "./personalization-signal.service";
import type {
  BehaviorProfileComputationDiagnostics,
  BehaviorProfileComputationInput,
  BehaviorProfileComputationStatus,
  BehaviorProfileRecomputeDecision,
  BehaviorProfileRecomputeTrigger,
  BehaviorProfileSnapshot,
  BehaviorSignalSummary,
  ComputedBehaviorProfile,
  UnknownBehaviorProfileFallback
} from "../types/behavior-profile.types";

const SIGNAL_LOOKBACK_DAYS = 60;

const MIN_PROFILE_SIGNAL_SAMPLE = 20;
const MIN_TIMED_ACTION_SAMPLES = 8;
const MIN_DECISION_EVENTS = 12;
const MIN_ACTION_EVENTS_FOR_REVIEW = 10;

const DEFAULT_STALE_AFTER_HOURS = 24;
const DEFAULT_SIGNAL_DELTA_THRESHOLD = 10;

const FAST_ACTION_MAX_MS = 15 * 60 * 1000;
const SLOW_ACTION_MIN_MS = 45 * 60 * 1000;
const QUICK_ACTION_RATE_FOR_FAST = 0.55;
const QUICK_ACTION_RATE_FOR_SLOW_MAX = 0.3;

const REVIEW_FIRST_RATE_MIN = 0.45;
const QUICK_ACTION_REVIEW_RATE_MAX = 0.2;
const QUICK_ACTION_DIRECT_RATE_MIN = 0.65;

const HIGH_DEFER_RATE_MIN = 0.45;
const LOW_DEFER_RATE_MAX = 0.2;

const HYSTERESIS_REVIEW_MARGIN = 0.08;
const HYSTERESIS_DEFER_MARGIN = 0.08;
const MIN_SWITCH_SAMPLE_SIZE = 40;

type BehaviorProfileServiceDependencies = {
  repository?: BehaviorProfileRepository;
  signalService?: PersonalizationSignalService;
  now?: () => Date;
  emitInternalEvent?: (input: {
    userId: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
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
  private readonly emitInternalEventFn: (input: {
    userId: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;

  constructor(dependencies: BehaviorProfileServiceDependencies = {}) {
    this.repository = dependencies.repository ?? new BehaviorProfileRepository();
    this.signalService =
      dependencies.signalService ?? new PersonalizationSignalService();
    this.now = dependencies.now ?? (() => new Date());
    this.emitInternalEventFn =
      dependencies.emitInternalEvent ??
      (async (input) => {
        await createAuditEvent({
          userId: input.userId,
          eventType: input.eventType,
          metadata: input.metadata as Prisma.InputJsonValue
        }).catch(() => null);
      });
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
      diagnostics?: Partial<BehaviorProfileComputationDiagnostics>;
    }
  ): UnknownBehaviorProfileFallback {
    const sampleSize = sanitizeSampleSize(input?.sampleSize ?? 0);
    const decisionEventCount = sanitizeSampleSize(
      input?.diagnostics?.decisionEventCount ?? 0
    );

    return {
      actionSpeed: BehaviorActionSpeed.UNKNOWN,
      reviewPreference: BehaviorReviewPreference.UNKNOWN,
      deferFrequency: BehaviorDeferFrequency.UNKNOWN,
      signalSampleSize: sampleSize,
      computedAt: input?.computedAt ?? this.now(),
      reason: "INSUFFICIENT_DATA",
      diagnostics: {
        sampleSize,
        decisionEventCount,
        timedActionSamples: sanitizeSampleSize(
          input?.diagnostics?.timedActionSamples ?? 0
        ),
        quickActionRate: input?.diagnostics?.quickActionRate ?? null,
        medianTimeToActionMs: input?.diagnostics?.medianTimeToActionMs ?? null,
        medianTimeToFirstActionMs:
          input?.diagnostics?.medianTimeToFirstActionMs ?? null,
        detailOpenRate: input?.diagnostics?.detailOpenRate ?? null,
        reviewPathRate: input?.diagnostics?.reviewPathRate ?? null,
        deferRate: input?.diagnostics?.deferRate ?? null,
        directActionRate: input?.diagnostics?.directActionRate ?? null
      }
    };
  }

  async computeBehaviorProfile(
    input: BehaviorProfileComputationInput
  ): Promise<ComputedBehaviorProfile> {
    const computedAt = input.computedAt ?? this.now();
    const sampleSize = sanitizeSampleSize(input.sampleSize);
    const signals = input.signals;
    const diagnostics = buildDiagnostics(sampleSize, signals);

    if (!signals || sampleSize < MIN_PROFILE_SIGNAL_SAMPLE) {
      return this.buildUnknownProfileFallback(input.userId, {
        sampleSize,
        computedAt,
        diagnostics
      });
    }

    const actionSpeed = inferActionSpeed(signals, diagnostics);
    const reviewPreference = inferReviewPreference(signals, diagnostics);
    const deferFrequency = inferDeferFrequency(signals, diagnostics);

    return {
      actionSpeed,
      reviewPreference,
      deferFrequency,
      signalSampleSize: sampleSize,
      computedAt,
      reason: "COMPUTED",
      diagnostics
    };
  }

  shouldRecomputeProfile(
    existingProfile: BehaviorProfileSnapshot | UserBehaviorProfile | null,
    signalSummary: {
      sampleSize: number;
      signals: BehaviorSignalSummary;
      windowStart: Date | null;
      windowEnd: Date | null;
      totalSignals?: number;
    } | null,
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
    const observedSignalDelta =
      context?.observedSignalCountSinceLastCompute ??
      (signalSummary
        ? Math.max(0, signalSummary.sampleSize - existingProfile.signalSampleSize)
        : 0);

    if (observedSignalDelta >= signalDeltaThreshold) {
      return {
        shouldRecompute: true,
        reason: "SIGNAL_DELTA_THRESHOLD_REACHED"
      };
    }

    if (
      existingProfile.signalSampleSize < MIN_PROFILE_SIGNAL_SAMPLE &&
      (signalSummary?.sampleSize ?? 0) >= MIN_PROFILE_SIGNAL_SAMPLE
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
    const now = this.now();
    const existingProfile = await this.repository.getByUserId(userId);

    const signalSummary = await this.signalService.summarizeSignalsForUser({
      userId,
      windowStart: subtractDays(now, SIGNAL_LOOKBACK_DAYS),
      windowEnd: now
    });

    const observedSignalCountSinceLastCompute =
      trigger?.observedSignalCountSinceLastCompute ??
      (await this.signalService.countSignalsForUserSince(
        userId,
        existingProfile?.lastComputedAt ?? null
      ));

    const recomputeDecision = this.shouldRecomputeProfile(
      existingProfile,
      signalSummary,
      {
        ...trigger,
        observedSignalCountSinceLastCompute
      }
    );

    if (!recomputeDecision.shouldRecompute && existingProfile) {
      return {
        profile: mapProfile(existingProfile),
        computedProfile: mapPersistedToComputedProfile(existingProfile),
        status: "SKIPPED_NOT_NEEDED",
        recomputeDecision
      };
    }

    const computationInput: BehaviorProfileComputationInput =
      input ??
      ({
        userId,
        sampleSize: signalSummary.sampleSize,
        signals: signalSummary.signals
      } satisfies BehaviorProfileComputationInput);

    const rawComputedProfile = await this.computeBehaviorProfile({
      ...computationInput,
      userId
    });
    const computedProfile = stabilizeAgainstExistingProfile(
      rawComputedProfile,
      existingProfile
    );

    if (!existingProfile && computedProfile.reason === "INSUFFICIENT_DATA") {
      await this.emitInternalEvent(userId, "behavior_profile_insufficient_data", {
        sampleSize: computedProfile.signalSampleSize,
        diagnostics: computedProfile.diagnostics ?? null
      });
    }

    if (existingProfile && isPersistedProfileEquivalent(existingProfile, computedProfile)) {
      return {
        profile: mapProfile(existingProfile),
        computedProfile,
        status: "SKIPPED_NOT_NEEDED",
        recomputeDecision
      };
    }

    const persisted = await this.repository.upsertComputedProfile(
      userId,
      computedProfile
    );

    await this.emitInternalEvent(userId, "behavior_profile_recomputed", {
      recomputeReason: recomputeDecision.reason,
      signalSampleSize: computedProfile.signalSampleSize,
      actionSpeed: computedProfile.actionSpeed,
      reviewPreference: computedProfile.reviewPreference,
      deferFrequency: computedProfile.deferFrequency,
      computationReason: computedProfile.reason,
      diagnostics: computedProfile.diagnostics ?? null
    });

    if (didProfileValueChange(existingProfile, persisted)) {
      await this.emitInternalEvent(userId, "behavior_profile_changed", {
        previous: existingProfile
          ? {
              actionSpeed: existingProfile.actionSpeed,
              reviewPreference: existingProfile.reviewPreference,
              deferFrequency: existingProfile.deferFrequency
            }
          : null,
        next: {
          actionSpeed: persisted.actionSpeed,
          reviewPreference: persisted.reviewPreference,
          deferFrequency: persisted.deferFrequency
        }
      });
    }

    return {
      profile: mapProfile(persisted),
      computedProfile,
      status: computedProfile.reason,
      recomputeDecision
    };
  }

  private async emitInternalEvent(
    userId: string,
    eventType: string,
    metadata: Record<string, unknown>
  ) {
    await this.emitInternalEventFn({
      userId,
      eventType,
      metadata
    }).catch(() => null);
  }
}

function inferActionSpeed(
  signals: BehaviorSignalSummary,
  diagnostics: BehaviorProfileComputationDiagnostics
): BehaviorActionSpeed {
  // Deterministic rule:
  // - Require enough timed samples to avoid overfitting sparse interactions.
  // - Use a buffer zone between FAST and SLOW thresholds to reduce oscillation.
  if (
    signals.timedActionSampleCount < MIN_TIMED_ACTION_SAMPLES ||
    diagnostics.medianTimeToActionMs === null
  ) {
    return BehaviorActionSpeed.UNKNOWN;
  }

  if (
    diagnostics.medianTimeToActionMs <= FAST_ACTION_MAX_MS &&
    (diagnostics.quickActionRate ?? 0) >= QUICK_ACTION_RATE_FOR_FAST
  ) {
    return BehaviorActionSpeed.FAST;
  }

  if (
    diagnostics.medianTimeToActionMs >= SLOW_ACTION_MIN_MS &&
    (diagnostics.quickActionRate ?? 1) <= QUICK_ACTION_RATE_FOR_SLOW_MAX
  ) {
    return BehaviorActionSpeed.SLOW;
  }

  return BehaviorActionSpeed.UNKNOWN;
}

function inferReviewPreference(
  signals: BehaviorSignalSummary,
  diagnostics: BehaviorProfileComputationDiagnostics
): BehaviorReviewPreference {
  // Deterministic rule:
  // - REVIEW_FIRST when review/detail behavior is meaningfully common.
  // - QUICK_ACTION when direct actions dominate and review behavior stays low.
  // - Otherwise UNKNOWN for mixed behavior.
  if (
    signals.totalActions < MIN_ACTION_EVENTS_FOR_REVIEW ||
    signals.decisionEventCount < MIN_DECISION_EVENTS
  ) {
    return BehaviorReviewPreference.UNKNOWN;
  }

  const reviewPathRate = diagnostics.reviewPathRate;
  const directActionRate = diagnostics.directActionRate;
  if (reviewPathRate === null || directActionRate === null) {
    return BehaviorReviewPreference.UNKNOWN;
  }

  if (reviewPathRate >= REVIEW_FIRST_RATE_MIN && signals.totalReviewStarts >= 3) {
    return BehaviorReviewPreference.REVIEW_FIRST;
  }

  if (
    reviewPathRate <= QUICK_ACTION_REVIEW_RATE_MAX &&
    directActionRate >= QUICK_ACTION_DIRECT_RATE_MIN
  ) {
    return BehaviorReviewPreference.QUICK_ACTION;
  }

  return BehaviorReviewPreference.UNKNOWN;
}

function inferDeferFrequency(
  signals: BehaviorSignalSummary,
  diagnostics: BehaviorProfileComputationDiagnostics
): BehaviorDeferFrequency {
  // Deterministic rule:
  // - Evaluate defer rate only with enough decision opportunities.
  // - Use conservative thresholds with a neutral zone in the middle.
  if (signals.decisionEventCount < MIN_DECISION_EVENTS) {
    return BehaviorDeferFrequency.UNKNOWN;
  }

  const deferRate = diagnostics.deferRate;
  if (deferRate === null) return BehaviorDeferFrequency.UNKNOWN;

  if (deferRate >= HIGH_DEFER_RATE_MIN && signals.totalDefers >= 4) {
    return BehaviorDeferFrequency.HIGH;
  }

  if (deferRate <= LOW_DEFER_RATE_MAX && signals.totalActions >= 6) {
    return BehaviorDeferFrequency.LOW;
  }

  return BehaviorDeferFrequency.UNKNOWN;
}

function buildDiagnostics(
  sampleSize: number,
  signals?: BehaviorSignalSummary
): BehaviorProfileComputationDiagnostics {
  if (!signals) {
    return {
      sampleSize,
      decisionEventCount: 0,
      timedActionSamples: 0,
      quickActionRate: null,
      medianTimeToActionMs: null,
      medianTimeToFirstActionMs: null,
      detailOpenRate: null,
      reviewPathRate: null,
      deferRate: null,
      directActionRate: null
    };
  }

  const decisionEventCount = signals.decisionEventCount;
  const timedActionSamples = signals.timedActionSampleCount;
  const quickActionRate =
    timedActionSamples > 0
      ? round(signals.quickTimedActionCount / timedActionSamples, 4)
      : null;
  const detailOpenRate =
    signals.totalActions > 0
      ? round(signals.totalDetailOpens / signals.totalActions, 4)
      : null;
  const reviewPathRate =
    signals.totalActions > 0
      ? round(signals.reviewPathCount / signals.totalActions, 4)
      : null;
  const deferRate =
    decisionEventCount > 0 ? round(signals.totalDefers / decisionEventCount, 4) : null;
  const directActionRate =
    decisionEventCount > 0
      ? round(signals.directActionCount / decisionEventCount, 4)
      : null;

  return {
    sampleSize,
    decisionEventCount,
    timedActionSamples,
    quickActionRate,
    medianTimeToActionMs: signals.medianTimeToActionMs,
    medianTimeToFirstActionMs: signals.medianTimeToFirstActionMs,
    detailOpenRate,
    reviewPathRate,
    deferRate,
    directActionRate
  };
}

function stabilizeAgainstExistingProfile(
  computed: ComputedBehaviorProfile,
  existingProfile: UserBehaviorProfile | null
): ComputedBehaviorProfile {
  if (!existingProfile) return computed;

  const next = {
    ...computed
  };

  // Anti-oscillation guard:
  // preserve prior non-UNKNOWN classifications when new evidence is weak or borderline.
  if (
    existingProfile.actionSpeed !== BehaviorActionSpeed.UNKNOWN &&
    next.actionSpeed === BehaviorActionSpeed.UNKNOWN &&
    next.signalSampleSize < MIN_SWITCH_SAMPLE_SIZE
  ) {
    next.actionSpeed = existingProfile.actionSpeed;
  }

  const reviewPathRate = next.diagnostics?.reviewPathRate;
  if (
    existingProfile.reviewPreference !== BehaviorReviewPreference.UNKNOWN &&
    next.reviewPreference !== existingProfile.reviewPreference &&
    next.signalSampleSize < MIN_SWITCH_SAMPLE_SIZE
  ) {
    if (
      reviewPathRate !== null &&
      reviewPathRate !== undefined &&
      Math.abs(reviewPathRate - REVIEW_FIRST_RATE_MIN) <= HYSTERESIS_REVIEW_MARGIN
    ) {
      next.reviewPreference = existingProfile.reviewPreference;
    }
  }

  const deferRate = next.diagnostics?.deferRate;
  if (
    existingProfile.deferFrequency !== BehaviorDeferFrequency.UNKNOWN &&
    next.deferFrequency !== existingProfile.deferFrequency &&
    next.signalSampleSize < MIN_SWITCH_SAMPLE_SIZE
  ) {
    if (
      deferRate !== null &&
      deferRate !== undefined &&
      (Math.abs(deferRate - HIGH_DEFER_RATE_MIN) <= HYSTERESIS_DEFER_MARGIN ||
        Math.abs(deferRate - LOW_DEFER_RATE_MAX) <= HYSTERESIS_DEFER_MARGIN)
    ) {
      next.deferFrequency = existingProfile.deferFrequency;
    }
  }

  return next;
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
      profile.signalSampleSize >= MIN_PROFILE_SIGNAL_SAMPLE &&
      profile.lastComputedAt !== null
        ? "COMPUTED"
        : "INSUFFICIENT_DATA"
  };
}

function isPersistedProfileEquivalent(
  existingProfile: UserBehaviorProfile,
  computedProfile: ComputedBehaviorProfile
) {
  return (
    existingProfile.actionSpeed === computedProfile.actionSpeed &&
    existingProfile.reviewPreference === computedProfile.reviewPreference &&
    existingProfile.deferFrequency === computedProfile.deferFrequency &&
    existingProfile.signalSampleSize === computedProfile.signalSampleSize
  );
}

function didProfileValueChange(
  existingProfile: UserBehaviorProfile | null,
  nextProfile: UserBehaviorProfile
) {
  if (!existingProfile) return true;
  return (
    existingProfile.actionSpeed !== nextProfile.actionSpeed ||
    existingProfile.reviewPreference !== nextProfile.reviewPreference ||
    existingProfile.deferFrequency !== nextProfile.deferFrequency
  );
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function subtractDays(base: Date, days: number) {
  return new Date(base.getTime() - days * 24 * 60 * 60 * 1000);
}
