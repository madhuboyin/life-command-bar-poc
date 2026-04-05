import { LlmModelTier, LlmTaskType } from "@prisma/client";
import { getTaskProfile } from "./llm-task-types";

export type LlmRoutingInput = {
  taskType: LlmTaskType;
  complexityScore?: number;
  businessImpact?: "LOW" | "MEDIUM" | "HIGH";
  requestedTier?: LlmModelTier;
  downgradeToLowCost?: boolean;
};

export type LlmRoute = {
  providerKey: string;
  modelKey: string;
  modelTier: LlmModelTier;
  maxLatencyMs: number;
  promptCachingEligible: boolean;
  structuredOutputPreferred: boolean;
  providerAvailable: boolean;
};

export class LlmRouter {
  route(input: LlmRoutingInput): LlmRoute {
    const profile = getTaskProfile(input.taskType);
    let tier = input.requestedTier ?? profile.preferredTier;

    const complexity = clamp(input.complexityScore ?? 0.5, 0, 1);
    if (!input.requestedTier && !input.downgradeToLowCost) {
      if (
        tier === LlmModelTier.TIER_LOW_COST &&
        (complexity >= 0.78 || input.businessImpact === "HIGH")
      ) {
        tier = LlmModelTier.TIER_REASONING;
      }
      if (tier === LlmModelTier.TIER_REASONING && complexity >= 0.92 && input.businessImpact === "HIGH") {
        tier = LlmModelTier.TIER_PREMIUM;
      }
    }

    if (input.downgradeToLowCost) {
      tier = LlmModelTier.TIER_LOW_COST;
    }

    const providerKey = resolveProviderKey();
    const modelKey = resolveModelKey(tier);
    const providerAvailable = providerKey !== "disabled";

    return {
      providerKey,
      modelKey,
      modelTier: tier,
      maxLatencyMs: profile.maxLatencyMs,
      promptCachingEligible: true,
      structuredOutputPreferred: true,
      providerAvailable
    };
  }
}

function resolveProviderKey() {
  const provider = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  const openAiKey = (process.env.OPENAI_API_KEY || "").trim();

  if (provider === "openai" && openAiKey) {
    return "openai";
  }

  return "disabled";
}

function resolveModelKey(tier: LlmModelTier) {
  if (tier === LlmModelTier.TIER_LOW_COST) {
    return (process.env.LLM_MODEL_LOW_COST || "gpt-5.4-mini").trim();
  }
  if (tier === LlmModelTier.TIER_REASONING) {
    return (process.env.LLM_MODEL_REASONING || "gpt-5.4").trim();
  }
  return (process.env.LLM_MODEL_PREMIUM || "gpt-5.4").trim();
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
