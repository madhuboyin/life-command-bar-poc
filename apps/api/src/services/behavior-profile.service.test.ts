import assert from "node:assert/strict";
import test from "node:test";
import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  type UserBehaviorProfile
} from "@prisma/client";
import {
  BehaviorProfileService,
  type RecomputeBehaviorProfileResult
} from "./behavior-profile.service";
import type { BehaviorSignalSummary } from "../types/behavior-profile.types";
import type { BehaviorProfileRepository } from "../repositories/behavior-profile.repository";
import type { PersonalizationSignalService } from "./personalization-signal.service";
import type { AdaptivePersonalizationRolloutService } from "./adaptive-personalization-rollout.service";

const FIXED_NOW = new Date("2026-02-10T12:00:00.000Z");

function createSummary(
  partial: Partial<BehaviorSignalSummary> = {}
): BehaviorSignalSummary {
  return {
    totalImpressions: 40,
    totalActions: 24,
    totalDefers: 8,
    totalDetailOpens: 4,
    totalWhyThisOpens: 1,
    totalReviewStarts: 4,
    totalReviewCompletions: 3,
    directActionCount: 20,
    reviewPathCount: 7,
    decisionEventCount: 32,
    timedActionSampleCount: 12,
    quickTimedActionCount: 8,
    medianTimeToActionMs: 12 * 60 * 1000,
    medianTimeToFirstActionMs: 10 * 60 * 1000,
    sampleSize: 40,
    ...partial
  };
}

function createProfile(input: Partial<UserBehaviorProfile> = {}): UserBehaviorProfile {
  return {
    id: input.id ?? "profile_1",
    userId: input.userId ?? "user_1",
    actionSpeed: input.actionSpeed ?? BehaviorActionSpeed.UNKNOWN,
    reviewPreference:
      input.reviewPreference ?? BehaviorReviewPreference.UNKNOWN,
    deferFrequency: input.deferFrequency ?? BehaviorDeferFrequency.UNKNOWN,
    signalSampleSize: input.signalSampleSize ?? 0,
    lastComputedAt: input.lastComputedAt ?? null,
    createdAt: input.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-01-01T00:00:00.000Z")
  };
}

function createServiceHarness(input?: {
  existingProfile?: UserBehaviorProfile | null;
  summary?: BehaviorSignalSummary;
  summarySampleSize?: number;
  signalDeltaSinceLast?: number;
  profileInferenceEnabled?: boolean;
}) {
  let profile = input?.existingProfile ?? null;
  let upsertCallCount = 0;
  const emittedEvents: Array<{
    userId: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }> = [];

  const repository = {
    async getByUserId() {
      return profile ? structuredClone(profile) : null;
    },
    async getOrCreateByUserId(userId: string) {
      if (!profile) {
        profile = createProfile({ userId });
      }
      return structuredClone(profile);
    },
    async upsertComputedProfile(
      userId: string,
      computed: {
        actionSpeed: BehaviorActionSpeed;
        reviewPreference: BehaviorReviewPreference;
        deferFrequency: BehaviorDeferFrequency;
        signalSampleSize: number;
        computedAt: Date;
      }
    ) {
      upsertCallCount += 1;
      profile = createProfile({
        ...(profile ?? {}),
        userId,
        actionSpeed: computed.actionSpeed,
        reviewPreference: computed.reviewPreference,
        deferFrequency: computed.deferFrequency,
        signalSampleSize: computed.signalSampleSize,
        lastComputedAt: computed.computedAt,
        updatedAt: computed.computedAt
      });
      return structuredClone(profile);
    }
  } as unknown as BehaviorProfileRepository;

  const summary = input?.summary ?? createSummary();
  const summarySampleSize = input?.summarySampleSize ?? summary.sampleSize;

  const signalService = {
    async summarizeSignalsForUser(args: { userId: string }) {
      return {
        userId: args.userId,
        sampleSize: summarySampleSize,
        signals: summary,
        windowStart: new Date("2026-01-01T00:00:00.000Z"),
        windowEnd: FIXED_NOW,
        totalSignals: summarySampleSize
      };
    },
    async countSignalsForUserSince() {
      return input?.signalDeltaSinceLast ?? 0;
    }
  } as unknown as PersonalizationSignalService;

  const service = new BehaviorProfileService({
    repository,
    signalService,
    rolloutService: {
      getUserRolloutState() {
        const profileInferenceEnabled = input?.profileInferenceEnabled ?? true;
        return {
          userId: "user_test",
          config: {
            globalEnabled: true,
            rolloutPercent: 100,
            profileInferenceEnabled,
            todayRankingEnabled: true,
            messagingEnabled: true,
            reminderTuningEnabled: true,
            debugMetadataEnabled: true,
            rolloutSalt: "test-salt"
          },
          inRolloutCohort: true,
          profileInferenceEnabled,
          todayPersonalizationEnabled: true,
          rankingEnabled: true,
          messagingEnabled: true,
          reminderTuningEnabled: true,
          debugMetadataEnabled: true,
          reason: "ENABLED" as const
        };
      }
    } as unknown as AdaptivePersonalizationRolloutService,
    now: () => FIXED_NOW,
    emitInternalEvent: async (event) => {
      emittedEvents.push(event);
    }
  });

  return {
    service,
    getUpsertCallCount: () => upsertCallCount,
    emittedEvents
  };
}

test("buildUnknownProfileFallback returns safe UNKNOWN defaults", () => {
  const { service } = createServiceHarness();

  const fallback = service.buildUnknownProfileFallback("user_a");

  assert.equal(fallback.actionSpeed, BehaviorActionSpeed.UNKNOWN);
  assert.equal(fallback.reviewPreference, BehaviorReviewPreference.UNKNOWN);
  assert.equal(fallback.deferFrequency, BehaviorDeferFrequency.UNKNOWN);
  assert.equal(fallback.signalSampleSize, 0);
  assert.equal(fallback.reason, "INSUFFICIENT_DATA");
});

test("computeBehaviorProfile returns UNKNOWN when sample size is insufficient", async () => {
  const { service } = createServiceHarness();

  const computed = await service.computeBehaviorProfile({
    userId: "user_b",
    sampleSize: 5,
    signals: createSummary({ sampleSize: 5 })
  });

  assert.equal(computed.actionSpeed, BehaviorActionSpeed.UNKNOWN);
  assert.equal(computed.reviewPreference, BehaviorReviewPreference.UNKNOWN);
  assert.equal(computed.deferFrequency, BehaviorDeferFrequency.UNKNOWN);
  assert.equal(computed.reason, "INSUFFICIENT_DATA");
});

test("computeBehaviorProfile infers FAST for consistently quick action behavior", async () => {
  const { service } = createServiceHarness();
  const computed = await service.computeBehaviorProfile({
    userId: "user_fast",
    sampleSize: 60,
    signals: createSummary({
      sampleSize: 60,
      timedActionSampleCount: 20,
      quickTimedActionCount: 14,
      medianTimeToActionMs: 8 * 60 * 1000,
      medianTimeToFirstActionMs: 7 * 60 * 1000
    })
  });

  assert.equal(computed.actionSpeed, BehaviorActionSpeed.FAST);
});

test("computeBehaviorProfile infers SLOW for consistently slow action behavior", async () => {
  const { service } = createServiceHarness();
  const computed = await service.computeBehaviorProfile({
    userId: "user_slow",
    sampleSize: 55,
    signals: createSummary({
      sampleSize: 55,
      timedActionSampleCount: 16,
      quickTimedActionCount: 2,
      medianTimeToActionMs: 70 * 60 * 1000,
      medianTimeToFirstActionMs: 65 * 60 * 1000
    })
  });

  assert.equal(computed.actionSpeed, BehaviorActionSpeed.SLOW);
});

test("computeBehaviorProfile infers REVIEW_FIRST from strong review-path behavior", async () => {
  const { service } = createServiceHarness();
  const computed = await service.computeBehaviorProfile({
    userId: "user_review",
    sampleSize: 60,
    signals: createSummary({
      sampleSize: 60,
      totalActions: 20,
      totalReviewStarts: 12,
      totalReviewCompletions: 8,
      reviewPathCount: 20,
      decisionEventCount: 28,
      directActionCount: 8
    })
  });

  assert.equal(computed.reviewPreference, BehaviorReviewPreference.REVIEW_FIRST);
});

test("computeBehaviorProfile infers QUICK_ACTION from low-review high-direct-action behavior", async () => {
  const { service } = createServiceHarness();
  const computed = await service.computeBehaviorProfile({
    userId: "user_quick",
    sampleSize: 60,
    signals: createSummary({
      sampleSize: 60,
      totalActions: 24,
      totalReviewStarts: 1,
      totalReviewCompletions: 1,
      reviewPathCount: 2,
      decisionEventCount: 30,
      directActionCount: 24
    })
  });

  assert.equal(computed.reviewPreference, BehaviorReviewPreference.QUICK_ACTION);
});

test("computeBehaviorProfile infers HIGH/LOW defer frequency from defer rate", async () => {
  const { service } = createServiceHarness();

  const high = await service.computeBehaviorProfile({
    userId: "user_high_defer",
    sampleSize: 50,
    signals: createSummary({
      sampleSize: 50,
      totalActions: 10,
      totalDefers: 10,
      decisionEventCount: 20
    })
  });
  assert.equal(high.deferFrequency, BehaviorDeferFrequency.HIGH);

  const low = await service.computeBehaviorProfile({
    userId: "user_low_defer",
    sampleSize: 50,
    signals: createSummary({
      sampleSize: 50,
      totalActions: 20,
      totalDefers: 2,
      decisionEventCount: 22
    })
  });
  assert.equal(low.deferFrequency, BehaviorDeferFrequency.LOW);
});

test("computeBehaviorProfile keeps UNKNOWN for mixed borderline behavior", async () => {
  const { service } = createServiceHarness();
  const computed = await service.computeBehaviorProfile({
    userId: "user_mixed",
    sampleSize: 45,
    signals: createSummary({
      sampleSize: 45,
      timedActionSampleCount: 12,
      quickTimedActionCount: 6,
      medianTimeToActionMs: 30 * 60 * 1000,
      totalActions: 18,
      totalReviewStarts: 5,
      totalReviewCompletions: 3,
      reviewPathCount: 8,
      directActionCount: 11,
      totalDefers: 6,
      decisionEventCount: 24
    })
  });

  assert.equal(computed.actionSpeed, BehaviorActionSpeed.UNKNOWN);
  assert.equal(computed.reviewPreference, BehaviorReviewPreference.UNKNOWN);
  assert.equal(computed.deferFrequency, BehaviorDeferFrequency.UNKNOWN);
});

test("shouldRecomputeProfile behaves predictably for missing/manual/stale/signal delta", () => {
  const { service } = createServiceHarness();

  const missing = service.shouldRecomputeProfile(null, null);
  assert.equal(missing.shouldRecompute, true);
  assert.equal(missing.reason, "MISSING_PROFILE");

  const recentProfile = createProfile({
    lastComputedAt: new Date("2026-02-10T11:30:00.000Z"),
    signalSampleSize: 20
  });
  const manual = service.shouldRecomputeProfile(recentProfile, null, { force: true });
  assert.equal(manual.shouldRecompute, true);
  assert.equal(manual.reason, "MANUAL_TRIGGER");

  const signalDelta = service.shouldRecomputeProfile(
    recentProfile,
    {
      sampleSize: 35,
      signals: createSummary({ sampleSize: 35 }),
      windowStart: new Date("2026-01-01T00:00:00.000Z"),
      windowEnd: FIXED_NOW,
      totalSignals: 35
    },
    {
      observedSignalCountSinceLastCompute: 15
    }
  );
  assert.equal(signalDelta.shouldRecompute, true);
  assert.equal(signalDelta.reason, "SIGNAL_DELTA_THRESHOLD_REACHED");

  const stale = service.shouldRecomputeProfile(
    createProfile({
      lastComputedAt: new Date("2026-02-09T00:00:00.000Z"),
      signalSampleSize: 20
    }),
    null,
    {
      now: FIXED_NOW
    }
  );
  assert.equal(stale.shouldRecompute, true);
  assert.equal(stale.reason, "PROFILE_STALE");
});

test("recomputeBehaviorProfile writes computed profile and remains stable on no-op", async () => {
  const existing = createProfile({
    userId: "user_recompute",
    actionSpeed: BehaviorActionSpeed.FAST,
    reviewPreference: BehaviorReviewPreference.QUICK_ACTION,
    deferFrequency: BehaviorDeferFrequency.LOW,
    signalSampleSize: 40,
    lastComputedAt: new Date("2026-02-10T11:50:00.000Z")
  });

  const { service, getUpsertCallCount } = createServiceHarness({
    existingProfile: existing,
    summary: createSummary({
      sampleSize: 42,
      timedActionSampleCount: 14,
      quickTimedActionCount: 10,
      medianTimeToActionMs: 10 * 60 * 1000,
      totalActions: 24,
      totalReviewStarts: 1,
      totalReviewCompletions: 1,
      reviewPathCount: 2,
      totalDefers: 3,
      decisionEventCount: 27,
      directActionCount: 22
    }),
    summarySampleSize: 42,
    signalDeltaSinceLast: 2
  });

  const skipped: RecomputeBehaviorProfileResult = await service.recomputeBehaviorProfile(
    "user_recompute"
  );
  assert.equal(skipped.status, "SKIPPED_NOT_NEEDED");
  assert.equal(getUpsertCallCount(), 0);

  const recomputed: RecomputeBehaviorProfileResult =
    await service.recomputeBehaviorProfile("user_recompute", undefined, {
      force: true
    });
  assert.equal(recomputed.status, "COMPUTED");
  assert.equal(getUpsertCallCount(), 1);
  assert.equal(recomputed.profile.actionSpeed, BehaviorActionSpeed.FAST);
});

test("recomputeBehaviorProfile applies anti-oscillation and preserves borderline prior classification", async () => {
  const existing = createProfile({
    userId: "user_stable",
    reviewPreference: BehaviorReviewPreference.QUICK_ACTION,
    signalSampleSize: 34,
    lastComputedAt: new Date("2026-02-09T00:00:00.000Z")
  });

  const { service } = createServiceHarness({
    existingProfile: existing,
    summary: createSummary({
      sampleSize: 34,
      totalActions: 14,
      totalReviewStarts: 4,
      totalReviewCompletions: 3,
      reviewPathCount: 7,
      decisionEventCount: 20,
      directActionCount: 10
    }),
    summarySampleSize: 34,
    signalDeltaSinceLast: 20
  });

  const recomputed = await service.recomputeBehaviorProfile("user_stable", undefined, {
    force: true
  });

  assert.equal(
    recomputed.profile.reviewPreference,
    BehaviorReviewPreference.QUICK_ACTION
  );
});

test("recomputeBehaviorProfile skips inference when profile-inference rollout is disabled", async () => {
  const { service, getUpsertCallCount, emittedEvents } = createServiceHarness({
    existingProfile: createProfile({
      userId: "user_rollout_off",
      signalSampleSize: 0,
      lastComputedAt: null
    }),
    profileInferenceEnabled: false
  });

  const result = await service.recomputeBehaviorProfile("user_rollout_off");

  assert.equal(result.status, "SKIPPED_NOT_NEEDED");
  assert.equal(result.recomputeDecision.reason, "SKIPPED_NOT_NEEDED");
  assert.equal(getUpsertCallCount(), 0);
  assert.equal(
    emittedEvents.some((event) => event.eventType === "personalization_fallback_used"),
    true
  );
});
