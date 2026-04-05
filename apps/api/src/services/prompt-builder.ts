import { LlmTaskType } from "@prisma/client";
import { stableStringify } from "./cache-key-normalizer";
import { getTaskProfile } from "./llm-task-types";

export type PromptBuildInput = {
  taskType: LlmTaskType;
  payload: Record<string, unknown>;
  promptVersion: string;
};

export type PromptBuildResult = {
  family: string;
  promptVersion: string;
  systemPrefix: string;
  userPrompt: string;
  promptKeySeed: string;
};

const SYSTEM_PREFIX_BY_TASK: Record<LlmTaskType, string> = {
  GMAIL_COMPLEX_EXTRACTION:
    "You are a deterministic extraction assistant for life-admin Gmail messages. Return strict JSON only. Do not invent fields. If uncertain, set null and include why in rationale.",
  GMAIL_LIFECYCLE_CONFLICT_RESOLUTION:
    "You resolve lifecycle conflicts for subscriptions. Use provided evidence only. Return strict JSON only and prefer conservative outputs when conflicts remain.",
  SUBSCRIPTION_PLAN_NORMALIZATION:
    "You normalize vendor and plan labels for subscriptions. Keep output deterministic and concise. Return strict JSON only.",
  RECOMMENDATION_REASONING:
    "You produce explainable recommendation reasoning grounded in structured subscription signals. Return strict JSON only.",
  GUIDED_FLOW_COPY_ENRICHMENT:
    "You refine guided-flow copy while preserving factual meaning. Keep tone calm and concise. Return strict JSON only.",
  REVIEW_SUMMARY_GENERATION:
    "You summarize review context from structured evidence. Return strict JSON only and avoid speculation.",
  CONTROL_TOWER_SUMMARY:
    "You generate concise operational summaries from structured metrics. Return strict JSON only.",
  GENERAL_UNKNOWN:
    "You are a conservative assistant for structured extraction. Return strict JSON only and never hallucinate."
};

export function buildPrompt(input: PromptBuildInput): PromptBuildResult {
  const profile = getTaskProfile(input.taskType);
  const systemPrefix = SYSTEM_PREFIX_BY_TASK[input.taskType];
  const payload = stableStringify(input.payload);

  return {
    family: profile.promptFamily,
    promptVersion: input.promptVersion,
    systemPrefix,
    userPrompt: [
      "TASK_CONTEXT_START",
      `task_type=${input.taskType}`,
      `prompt_family=${profile.promptFamily}`,
      "payload_json=",
      payload,
      "TASK_CONTEXT_END"
    ].join("\n"),
    promptKeySeed: `${profile.promptFamily}|${input.promptVersion}|${systemPrefix}`
  };
}
