import { LlmCacheStrategy, LlmModelTier, LlmTaskType } from "@prisma/client";

export type LlmTaskProfile = {
  taskType: LlmTaskType;
  urgency: "SYNC" | "ASYNC";
  maxLatencyMs: number;
  maxCostUsd: number;
  cacheable: boolean;
  cacheTtlSeconds: number;
  cacheStrategy: LlmCacheStrategy;
  deterministicFallbackAvailable: boolean;
  preferredTier: LlmModelTier;
  asyncAllowed: boolean;
  promptFamily: string;
};

export const LLM_TASK_PROFILES: Record<LlmTaskType, LlmTaskProfile> = {
  GMAIL_COMPLEX_EXTRACTION: {
    taskType: LlmTaskType.GMAIL_COMPLEX_EXTRACTION,
    urgency: "SYNC",
    maxLatencyMs: 2400,
    maxCostUsd: 0.008,
    cacheable: true,
    cacheTtlSeconds: 60 * 60 * 24 * 45,
    cacheStrategy: LlmCacheStrategy.TEMPLATE_VENDOR,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_LOW_COST,
    asyncAllowed: false,
    promptFamily: "gmail_complex_extraction"
  },
  GMAIL_LIFECYCLE_CONFLICT_RESOLUTION: {
    taskType: LlmTaskType.GMAIL_LIFECYCLE_CONFLICT_RESOLUTION,
    urgency: "SYNC",
    maxLatencyMs: 2800,
    maxCostUsd: 0.012,
    cacheable: true,
    cacheTtlSeconds: 60 * 60 * 24 * 20,
    cacheStrategy: LlmCacheStrategy.EXACT_INPUT,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_REASONING,
    asyncAllowed: false,
    promptFamily: "gmail_lifecycle_conflict"
  },
  SUBSCRIPTION_PLAN_NORMALIZATION: {
    taskType: LlmTaskType.SUBSCRIPTION_PLAN_NORMALIZATION,
    urgency: "ASYNC",
    maxLatencyMs: 2000,
    maxCostUsd: 0.004,
    cacheable: true,
    cacheTtlSeconds: 60 * 60 * 24 * 60,
    cacheStrategy: LlmCacheStrategy.TEMPLATE_VENDOR,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_LOW_COST,
    asyncAllowed: true,
    promptFamily: "subscription_plan_normalization"
  },
  RECOMMENDATION_REASONING: {
    taskType: LlmTaskType.RECOMMENDATION_REASONING,
    urgency: "ASYNC",
    maxLatencyMs: 3500,
    maxCostUsd: 0.01,
    cacheable: true,
    cacheTtlSeconds: 60 * 60 * 24 * 7,
    cacheStrategy: LlmCacheStrategy.EXACT_INPUT,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_REASONING,
    asyncAllowed: true,
    promptFamily: "recommendation_reasoning"
  },
  GUIDED_FLOW_COPY_ENRICHMENT: {
    taskType: LlmTaskType.GUIDED_FLOW_COPY_ENRICHMENT,
    urgency: "ASYNC",
    maxLatencyMs: 3500,
    maxCostUsd: 0.009,
    cacheable: true,
    cacheTtlSeconds: 60 * 60 * 24 * 3,
    cacheStrategy: LlmCacheStrategy.EXACT_INPUT,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_REASONING,
    asyncAllowed: true,
    promptFamily: "guided_flow_copy"
  },
  REVIEW_SUMMARY_GENERATION: {
    taskType: LlmTaskType.REVIEW_SUMMARY_GENERATION,
    urgency: "ASYNC",
    maxLatencyMs: 3000,
    maxCostUsd: 0.006,
    cacheable: true,
    cacheTtlSeconds: 60 * 60 * 24 * 2,
    cacheStrategy: LlmCacheStrategy.EXACT_INPUT,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_LOW_COST,
    asyncAllowed: true,
    promptFamily: "review_summary"
  },
  CONTROL_TOWER_SUMMARY: {
    taskType: LlmTaskType.CONTROL_TOWER_SUMMARY,
    urgency: "ASYNC",
    maxLatencyMs: 3200,
    maxCostUsd: 0.008,
    cacheable: true,
    cacheTtlSeconds: 60 * 60 * 24,
    cacheStrategy: LlmCacheStrategy.EXACT_INPUT,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_LOW_COST,
    asyncAllowed: true,
    promptFamily: "control_tower_summary"
  },
  GENERAL_UNKNOWN: {
    taskType: LlmTaskType.GENERAL_UNKNOWN,
    urgency: "SYNC",
    maxLatencyMs: 2800,
    maxCostUsd: 0.012,
    cacheable: true,
    cacheTtlSeconds: 60 * 30,
    cacheStrategy: LlmCacheStrategy.EXACT_INPUT,
    deterministicFallbackAvailable: true,
    preferredTier: LlmModelTier.TIER_LOW_COST,
    asyncAllowed: false,
    promptFamily: "general_unknown"
  }
};

export function getTaskProfile(taskType: LlmTaskType): LlmTaskProfile {
  return LLM_TASK_PROFILES[taskType];
}
