import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  Prisma,
  type UserBehaviorProfile
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import type { ComputedBehaviorProfile } from "../types/behavior-profile.types";

export type BehaviorProfileRepositoryClient = Pick<
  typeof prisma,
  "userBehaviorProfile"
>;
type DbClient = Prisma.TransactionClient | BehaviorProfileRepositoryClient;

type ComputedProfileWriteInput = Pick<
  ComputedBehaviorProfile,
  | "actionSpeed"
  | "reviewPreference"
  | "deferFrequency"
  | "signalSampleSize"
  | "computedAt"
>;

export class BehaviorProfileRepository {
  constructor(private readonly db: BehaviorProfileRepositoryClient = prisma) {}

  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async getByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(this.db, tx);
    return db.userBehaviorProfile.findUnique({
      where: {
        userId
      }
    });
  }

  async getOrCreateByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(this.db, tx);
    return db.userBehaviorProfile.upsert({
      where: {
        userId
      },
      create: buildUnknownCreateInput(userId),
      update: {}
    });
  }

  async createForUser(userId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(this.db, tx);
    return db.userBehaviorProfile.create({
      data: buildUnknownCreateInput(userId)
    });
  }

  async updateProfile(
    userId: string,
    data: Prisma.UserBehaviorProfileUpdateInput,
    tx?: Prisma.TransactionClient
  ): Promise<UserBehaviorProfile> {
    const db = getDb(this.db, tx);

    try {
      return await db.userBehaviorProfile.update({
        where: {
          userId
        },
        data
      });
    } catch (error) {
      if (!isRecordNotFoundError(error)) {
        throw error;
      }
    }

    const created = await this.createForUser(userId, tx);
    if (isUpdateInputEmpty(data)) {
      return created;
    }

    return db.userBehaviorProfile.update({
      where: {
        id: created.id
      },
      data
    });
  }

  async upsertComputedProfile(
    userId: string,
    computedProfile: ComputedProfileWriteInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(this.db, tx);

    return db.userBehaviorProfile.upsert({
      where: {
        userId
      },
      create: {
        userId,
        actionSpeed: computedProfile.actionSpeed,
        reviewPreference: computedProfile.reviewPreference,
        deferFrequency: computedProfile.deferFrequency,
        signalSampleSize: computedProfile.signalSampleSize,
        lastComputedAt: computedProfile.computedAt
      },
      update: {
        actionSpeed: computedProfile.actionSpeed,
        reviewPreference: computedProfile.reviewPreference,
        deferFrequency: computedProfile.deferFrequency,
        signalSampleSize: computedProfile.signalSampleSize,
        lastComputedAt: computedProfile.computedAt
      }
    });
  }
}

function buildUnknownCreateInput(
  userId: string
): Prisma.UserBehaviorProfileUncheckedCreateInput {
  return {
    userId,
    actionSpeed: BehaviorActionSpeed.UNKNOWN,
    reviewPreference: BehaviorReviewPreference.UNKNOWN,
    deferFrequency: BehaviorDeferFrequency.UNKNOWN,
    signalSampleSize: 0,
    lastComputedAt: null
  };
}

function getDb(
  db: BehaviorProfileRepositoryClient,
  tx?: Prisma.TransactionClient
): DbClient {
  return tx ?? db;
}

function isRecordNotFoundError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    return true;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

function isUpdateInputEmpty(data: Prisma.UserBehaviorProfileUpdateInput) {
  return Object.keys(data).length === 0;
}
