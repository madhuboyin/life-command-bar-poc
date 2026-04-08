import assert from "node:assert/strict";
import test from "node:test";
import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference
} from "@prisma/client";
import {
  BehaviorProfileRepository,
  type BehaviorProfileRepositoryClient
} from "./behavior-profile.repository";

type ProfileRecord = {
  id: string;
  userId: string;
  actionSpeed: BehaviorActionSpeed;
  reviewPreference: BehaviorReviewPreference;
  deferFrequency: BehaviorDeferFrequency;
  signalSampleSize: number;
  lastComputedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createInMemoryRepository() {
  const records = new Map<string, ProfileRecord>();
  let sequence = 0;

  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, sequence++));

  const createRecord = (data: Partial<ProfileRecord> & { userId: string }) => {
    const timestamp = now();
    const record: ProfileRecord = {
      id: data.id ?? `profile_${sequence}`,
      userId: data.userId,
      actionSpeed: data.actionSpeed ?? BehaviorActionSpeed.UNKNOWN,
      reviewPreference: data.reviewPreference ?? BehaviorReviewPreference.UNKNOWN,
      deferFrequency: data.deferFrequency ?? BehaviorDeferFrequency.UNKNOWN,
      signalSampleSize: data.signalSampleSize ?? 0,
      lastComputedAt: data.lastComputedAt ?? null,
      createdAt: data.createdAt ?? timestamp,
      updatedAt: data.updatedAt ?? timestamp
    };
    return record;
  };

  const resolveByWhere = (where: { userId?: string; id?: string }) => {
    if (where.userId) {
      return records.get(where.userId) ?? null;
    }

    if (where.id) {
      for (const record of records.values()) {
        if (record.id === where.id) return record;
      }
    }

    return null;
  };

  const applyUpdate = (record: ProfileRecord, data: Record<string, unknown>) => {
    if (typeof data.actionSpeed === "string") {
      record.actionSpeed = data.actionSpeed as BehaviorActionSpeed;
    }
    if (typeof data.reviewPreference === "string") {
      record.reviewPreference = data.reviewPreference as BehaviorReviewPreference;
    }
    if (typeof data.deferFrequency === "string") {
      record.deferFrequency = data.deferFrequency as BehaviorDeferFrequency;
    }
    if (typeof data.signalSampleSize === "number") {
      record.signalSampleSize = data.signalSampleSize;
    }
    if ("lastComputedAt" in data) {
      record.lastComputedAt = (data.lastComputedAt as Date | null) ?? null;
    }
    record.updatedAt = now();
  };

  const delegate = {
    async findUnique(args: { where: { userId: string } }) {
      const record = resolveByWhere(args.where);
      return record ? structuredClone(record) : null;
    },
    async create(args: { data: Partial<ProfileRecord> & { userId: string } }) {
      const existing = records.get(args.data.userId);
      if (existing) {
        throw new Error("duplicate user profile");
      }

      const record = createRecord(args.data);
      records.set(record.userId, record);
      return structuredClone(record);
    },
    async update(args: { where: { userId?: string; id?: string }; data: Record<string, unknown> }) {
      const existing = resolveByWhere(args.where);
      if (!existing) {
        throw { code: "P2025" };
      }

      applyUpdate(existing, args.data);
      records.set(existing.userId, existing);
      return structuredClone(existing);
    },
    async upsert(args: {
      where: { userId: string };
      create: Partial<ProfileRecord> & { userId: string };
      update: Record<string, unknown>;
    }) {
      const existing = records.get(args.where.userId);
      if (existing) {
        applyUpdate(existing, args.update);
        records.set(existing.userId, existing);
        return structuredClone(existing);
      }

      const record = createRecord(args.create);
      records.set(record.userId, record);
      return structuredClone(record);
    }
  };

  const repository = new BehaviorProfileRepository({
    userBehaviorProfile: delegate
  } as unknown as BehaviorProfileRepositoryClient);

  return {
    repository
  };
}

test("createForUser persists UNKNOWN defaults", async () => {
  const { repository } = createInMemoryRepository();

  const created = await repository.createForUser("user_1");

  assert.equal(created.userId, "user_1");
  assert.equal(created.actionSpeed, BehaviorActionSpeed.UNKNOWN);
  assert.equal(created.reviewPreference, BehaviorReviewPreference.UNKNOWN);
  assert.equal(created.deferFrequency, BehaviorDeferFrequency.UNKNOWN);
  assert.equal(created.signalSampleSize, 0);
  assert.equal(created.lastComputedAt, null);
});

test("getOrCreateByUserId returns existing profile when present", async () => {
  const { repository } = createInMemoryRepository();
  await repository.createForUser("user_2");
  await repository.updateProfile("user_2", {
    actionSpeed: BehaviorActionSpeed.FAST
  });

  const profile = await repository.getOrCreateByUserId("user_2");

  assert.equal(profile.userId, "user_2");
  assert.equal(profile.actionSpeed, BehaviorActionSpeed.FAST);
});

test("updateProfile creates record when profile is missing", async () => {
  const { repository } = createInMemoryRepository();

  const updated = await repository.updateProfile("user_3", {
    reviewPreference: BehaviorReviewPreference.REVIEW_FIRST,
    signalSampleSize: 12
  });

  assert.equal(updated.userId, "user_3");
  assert.equal(updated.reviewPreference, BehaviorReviewPreference.REVIEW_FIRST);
  assert.equal(updated.signalSampleSize, 12);
  assert.equal(updated.actionSpeed, BehaviorActionSpeed.UNKNOWN);
});

test("upsertComputedProfile writes computed fields safely", async () => {
  const { repository } = createInMemoryRepository();
  const computedAt = new Date("2026-01-02T00:00:00.000Z");

  const profile = await repository.upsertComputedProfile("user_4", {
    actionSpeed: BehaviorActionSpeed.SLOW,
    reviewPreference: BehaviorReviewPreference.QUICK_ACTION,
    deferFrequency: BehaviorDeferFrequency.HIGH,
    signalSampleSize: 48,
    computedAt
  });

  assert.equal(profile.userId, "user_4");
  assert.equal(profile.actionSpeed, BehaviorActionSpeed.SLOW);
  assert.equal(profile.reviewPreference, BehaviorReviewPreference.QUICK_ACTION);
  assert.equal(profile.deferFrequency, BehaviorDeferFrequency.HIGH);
  assert.equal(profile.signalSampleSize, 48);
  assert.equal(profile.lastComputedAt?.toISOString(), computedAt.toISOString());
});
