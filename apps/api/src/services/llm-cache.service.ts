import {
  LlmCacheEntry,
  LlmCacheStrategy,
  LlmModelTier,
  LlmTaskType,
  Prisma
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";

export class LlmCacheService {
  async getValidEntry(input: {
    taskType: LlmTaskType;
    cacheKey: string;
    modelKey: string;
    promptVersion: string;
    parserVersion: string;
  }): Promise<LlmCacheEntry | null> {
    const now = new Date();
    return prisma.llmCacheEntry.findFirst({
      where: {
        taskType: input.taskType,
        cacheKey: input.cacheKey,
        modelKey: input.modelKey,
        promptVersion: input.promptVersion,
        parserVersion: input.parserVersion,
        invalidatedAt: null,
        expiresAt: {
          gt: now
        }
      }
    });
  }

  async putEntry(input: {
    userId: string;
    householdId?: string | null;
    taskType: LlmTaskType;
    cacheStrategy: LlmCacheStrategy;
    cacheKey: string;
    inputHash: string;
    modelKey: string;
    providerKey: string;
    modelTier: LlmModelTier;
    promptVersion: string;
    parserVersion: string;
    output: Prisma.InputJsonValue;
    confidenceScore?: number | null;
    metadata?: Prisma.InputJsonValue;
    ttlSeconds: number;
  }) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(60, input.ttlSeconds) * 1000);

    return prisma.llmCacheEntry.upsert({
      where: {
        taskType_cacheKey_modelKey_promptVersion_parserVersion: {
          taskType: input.taskType,
          cacheKey: input.cacheKey,
          modelKey: input.modelKey,
          promptVersion: input.promptVersion,
          parserVersion: input.parserVersion
        }
      },
      create: {
        userId: input.userId,
        householdId: input.householdId ?? null,
        taskType: input.taskType,
        cacheStrategy: input.cacheStrategy,
        cacheKey: input.cacheKey,
        inputHash: input.inputHash,
        modelKey: input.modelKey,
        providerKey: input.providerKey,
        modelTier: input.modelTier,
        promptVersion: input.promptVersion,
        parserVersion: input.parserVersion,
        output: input.output,
        confidenceScore: input.confidenceScore ?? null,
        metadata: input.metadata,
        expiresAt
      },
      update: {
        output: input.output,
        confidenceScore: input.confidenceScore ?? null,
        metadata: input.metadata,
        providerKey: input.providerKey,
        modelTier: input.modelTier,
        expiresAt,
        invalidatedAt: null
      }
    });
  }

  async invalidate(input: {
    userId: string;
    householdId?: string | null;
    taskType?: LlmTaskType;
    reason: string;
  }) {
    const now = new Date();
    return prisma.llmCacheEntry.updateMany({
      where: {
        userId: input.userId,
        householdId: input.householdId ?? undefined,
        taskType: input.taskType,
        invalidatedAt: null
      },
      data: {
        invalidatedAt: now,
        metadata: {
          invalidationReason: input.reason,
          invalidatedAt: now.toISOString()
        }
      }
    });
  }
}
