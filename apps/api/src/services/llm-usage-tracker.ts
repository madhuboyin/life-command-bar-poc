import { LlmCallStatus, LlmModelTier, LlmTaskType, Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";

export type LlmUsageTrackInput = {
  userId: string;
  householdId?: string | null;
  taskType: LlmTaskType;
  status: LlmCallStatus;
  providerKey: string;
  modelKey: string;
  modelTier: LlmModelTier;
  cacheHit: boolean;
  promptCacheHit?: boolean | null;
  gateSkipped: boolean;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number;
  latencyMs?: number | null;
  rationale?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  cacheEntryId?: string | null;
};

export class LlmUsageTracker {
  async track(input: LlmUsageTrackInput) {
    const record = await prisma.llmUsageRecord.create({
      data: {
        userId: input.userId,
        householdId: input.householdId ?? null,
        taskType: input.taskType,
        status: input.status,
        providerKey: input.providerKey,
        modelKey: input.modelKey,
        modelTier: input.modelTier,
        cacheHit: input.cacheHit,
        promptCacheHit: input.promptCacheHit ?? null,
        gateSkipped: input.gateSkipped,
        promptTokens: input.promptTokens ?? null,
        completionTokens: input.completionTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        estimatedCostUsd: input.estimatedCostUsd ?? 0,
        latencyMs: input.latencyMs ?? null,
        rationale: input.rationale,
        metadata: input.metadata,
        cacheEntryId: input.cacheEntryId ?? null
      }
    });

    return record;
  }

  async emitRequestedEvent(input: {
    userId: string;
    householdId?: string | null;
    taskType: LlmTaskType;
    metadata?: Prisma.InputJsonValue;
  }) {
    await createAuditEvent({
      userId: input.userId,
      householdId: input.householdId ?? null,
      eventType: "llm_call_requested",
      metadata: {
        taskType: input.taskType,
        ...(toObject(input.metadata) ?? {})
      }
    }).catch(() => null);
  }

  async emitEvent(input: {
    userId: string;
    householdId?: string | null;
    eventType:
      | "llm_call_skipped_by_gate"
      | "llm_cache_hit"
      | "llm_cache_miss"
      | "llm_provider_prompt_cache_hit_if_available"
      | "llm_call_completed"
      | "llm_call_failed"
      | "llm_budget_soft_limit_hit"
      | "llm_model_routed"
      | "llm_async_task_enqueued";
    metadata?: Prisma.InputJsonValue;
  }) {
    await createAuditEvent({
      userId: input.userId,
      householdId: input.householdId ?? null,
      eventType: input.eventType,
      metadata: input.metadata
    }).catch(() => null);
  }
}

export function estimateLlmCostUsd(input: {
  modelTier: LlmModelTier;
  promptTokens?: number | null;
  completionTokens?: number | null;
}) {
  const promptTokens = Math.max(0, input.promptTokens ?? 0);
  const completionTokens = Math.max(0, input.completionTokens ?? 0);

  const pricing = pricingForTier(input.modelTier);
  return (
    (promptTokens / 1_000_000) * pricing.promptPerMillion +
    (completionTokens / 1_000_000) * pricing.completionPerMillion
  );
}

function pricingForTier(tier: LlmModelTier) {
  if (tier === LlmModelTier.TIER_LOW_COST) {
    return {
      promptPerMillion: 0.2,
      completionPerMillion: 0.8
    };
  }

  if (tier === LlmModelTier.TIER_REASONING) {
    return {
      promptPerMillion: 1.2,
      completionPerMillion: 4.8
    };
  }

  return {
    promptPerMillion: 2.4,
    completionPerMillion: 9.6
  };
}

function toObject(value: Prisma.InputJsonValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
