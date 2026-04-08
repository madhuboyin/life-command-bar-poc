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
import type { BehaviorProfileComputationInput } from "../types/behavior-profile.types";
import type { BehaviorProfileRepository } from "../repositories/behavior-profile.repository";
import type { PersonalizationSignalService } from "./personalization-signal.service";

const FIXED_NOW = new Date("2026-02-01T12:00:00.000Z");

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
  signalComputationInput?: BehaviorProfileComputationInput;
}) {
  let profile = input?.existingProfile ?? null;

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

  const signalService = {
    async buildComputationInput(args: { userId: string }) {
      return (
        input?.signalComputationInput ?? {
          userId: args.userId,
          sampleSize: 0,
          signals: undefined
        }
      );
    }
  } as unknown as PersonalizationSignalService;

  const service = new BehaviorProfileService({
    repository,
    signalService,
    now: () => FIXED_NOW
  });

  return { service };
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

test("computeBehaviorProfile keeps UNKNOWN for insufficient samples", async () => {
  const { service } = createServiceHarness();

  const computed = await service.computeBehaviorProfile({
    userId: "user_b",
    sampleSize: 5
  });

  assert.equal(computed.actionSpeed, BehaviorActionSpeed.UNKNOWN);
  assert.equal(computed.reviewPreference, BehaviorReviewPreference.UNKNOWN);
  assert.equal(computed.deferFrequency, BehaviorDeferFrequency.UNKNOWN);
  assert.equal(computed.reason, "INSUFFICIENT_DATA");
});

test("shouldRecomputeProfile covers missing, stale, manual, and skip branches", () => {
  const { service } = createServiceHarness();

  const missing = service.shouldRecomputeProfile(null);
  assert.equal(missing.shouldRecompute, true);
  assert.equal(missing.reason, "MISSING_PROFILE");

  const recentProfile = createProfile({
    lastComputedAt: new Date("2026-02-01T11:30:00.000Z"),
    signalSampleSize: 40
  });
  const skipped = service.shouldRecomputeProfile(recentProfile, {
    now: FIXED_NOW
  });
  assert.equal(skipped.shouldRecompute, false);
  assert.equal(skipped.reason, "SKIPPED_NOT_NEEDED");

  const manual = service.shouldRecomputeProfile(recentProfile, { force: true });
  assert.equal(manual.shouldRecompute, true);
  assert.equal(manual.reason, "MANUAL_TRIGGER");

  const stale = service.shouldRecomputeProfile(
    createProfile({
      lastComputedAt: new Date("2026-01-30T00:00:00.000Z")
    }),
    {
      now: FIXED_NOW
    }
  );
  assert.equal(stale.shouldRecompute, true);
  assert.equal(stale.reason, "PROFILE_STALE");
});

test("recomputeBehaviorProfile handles missing signals without crashing", async () => {
  const { service } = createServiceHarness();

  const result: RecomputeBehaviorProfileResult =
    await service.recomputeBehaviorProfile("user_c");

  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.profile.userId, "user_c");
  assert.equal(result.profile.actionSpeed, BehaviorActionSpeed.UNKNOWN);
  assert.equal(result.profile.reviewPreference, BehaviorReviewPreference.UNKNOWN);
  assert.equal(result.profile.deferFrequency, BehaviorDeferFrequency.UNKNOWN);
});

test("computeBehaviorProfile emits only valid enum values on computed branch", async () => {
  const { service } = createServiceHarness();

  const computed = await service.computeBehaviorProfile({
    userId: "user_d",
    sampleSize: 60,
    signals: {
      totalImpressions: 60,
      totalActions: 40,
      totalDefers: 5,
      totalLeftUntouched: 15,
      detailOpenCount: 2,
      whyThisOpenCount: 1,
      reviewStartCount: 1,
      reviewCompleteCount: 1,
      medianTimeToActionMs: 9 * 60 * 1000,
      medianTimeToFirstActionMs: 8 * 60 * 1000
    }
  });

  assert.ok(
    [BehaviorActionSpeed.FAST, BehaviorActionSpeed.SLOW, BehaviorActionSpeed.UNKNOWN].includes(
      computed.actionSpeed
    )
  );
  assert.ok(
    [
      BehaviorReviewPreference.QUICK_ACTION,
      BehaviorReviewPreference.REVIEW_FIRST,
      BehaviorReviewPreference.UNKNOWN
    ].includes(computed.reviewPreference)
  );
  assert.ok(
    [BehaviorDeferFrequency.LOW, BehaviorDeferFrequency.HIGH, BehaviorDeferFrequency.UNKNOWN].includes(
      computed.deferFrequency
    )
  );
});
