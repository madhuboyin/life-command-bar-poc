import { LlmCacheStrategy, LlmTaskType } from "@prisma/client";
import { hashNormalizedInput, normalizeCacheInput } from "./cache-key-normalizer";

export type PromptCacheKeyInput = {
  taskType: LlmTaskType;
  cacheStrategy: LlmCacheStrategy;
  promptFamily: string;
  promptVersion: string;
  parserVersion: string;
  userId: string;
  householdId?: string | null;
  modelKey: string;
  normalizedInput: unknown;
  templateHint?: string | null;
};

export type PromptCacheKeyResult = {
  cacheKey: string;
  inputHash: string;
};

export function buildPromptCacheKey(input: PromptCacheKeyInput): PromptCacheKeyResult {
  const normalizedInput = normalizeCacheInput(input.normalizedInput);
  const inputHash = hashNormalizedInput(normalizedInput);
  const scopeKey = `u:${input.userId}|h:${input.householdId ?? "none"}`;

  let strategyKey = inputHash;
  if (input.cacheStrategy === LlmCacheStrategy.TEMPLATE_VENDOR) {
    strategyKey = hashNormalizedInput({
      templateHint: input.templateHint ?? "none",
      family: input.promptFamily,
      parsed: normalizedInput
    });
  } else if (input.cacheStrategy === LlmCacheStrategy.PROMPT_PREFIX) {
    strategyKey = hashNormalizedInput({
      family: input.promptFamily,
      parserVersion: input.parserVersion
    });
  }

  return {
    cacheKey: [
      scopeKey,
      `task:${input.taskType}`,
      `family:${input.promptFamily}`,
      `strategy:${input.cacheStrategy}`,
      `hash:${strategyKey}`,
      `prompt:${input.promptVersion}`,
      `parser:${input.parserVersion}`,
      `model:${input.modelKey}`
    ].join("|"),
    inputHash
  };
}
