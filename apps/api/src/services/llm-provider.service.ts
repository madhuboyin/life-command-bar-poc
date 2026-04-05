import { AppError } from "../utils/app-error";
import type { LlmRoute } from "./llm-router";

export type LlmProviderCallInput = {
  route: LlmRoute;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
};

export type LlmProviderCallResult = {
  text: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  promptCacheHit: boolean | null;
  raw: Record<string, unknown> | null;
};

export class LlmProviderService {
  async call(input: LlmProviderCallInput): Promise<LlmProviderCallResult> {
    if (input.route.providerKey === "openai") {
      return callOpenAi(input);
    }

    throw new AppError("LLM_PROVIDER_UNAVAILABLE", "No LLM provider is configured", 503, {
      providerKey: input.route.providerKey
    });
  }
}

async function callOpenAi(input: LlmProviderCallInput): Promise<LlmProviderCallResult> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new AppError("LLM_PROVIDER_UNAVAILABLE", "OPENAI_API_KEY is not configured", 503);
  }

  const timeoutMs = Math.max(1_000, input.route.maxLatencyMs + 1_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.route.modelKey,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: input.systemPrompt
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: input.userPrompt
              }
            ]
          }
        ],
        max_output_tokens: input.maxOutputTokens ?? 700,
        temperature: input.temperature ?? 0.1
      }),
      signal: controller.signal
    });

    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!response.ok) {
      throw new AppError("LLM_PROVIDER_ERROR", "OpenAI request failed", 502, {
        status: response.status,
        payload
      });
    }
    if (!payload) {
      throw new AppError("LLM_PROVIDER_ERROR", "OpenAI returned empty response payload", 502);
    }

    const text = getOutputText(payload);
    if (!text) {
      throw new AppError("LLM_PROVIDER_ERROR", "OpenAI returned no text output", 502);
    }

    const usage = asRecord(payload.usage);

    return {
      text,
      promptTokens: asNumber(usage?.input_tokens),
      completionTokens: asNumber(usage?.output_tokens),
      totalTokens: asNumber(usage?.total_tokens),
      promptCacheHit: asBoolean(
        asRecord(usage?.input_tokens_details)?.cached_tokens &&
          Number(asRecord(usage?.input_tokens_details)?.cached_tokens) > 0
      ),
      raw: payload
    };
  } finally {
    clearTimeout(timer);
  }
}

function getOutputText(payload: Record<string, unknown>) {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct;
  }

  const output = payload.output;
  if (!Array.isArray(output)) return null;

  const collected: string[] = [];
  for (const item of output) {
    const itemRecord = asRecord(item);
    const content = itemRecord?.content;
    if (!Array.isArray(content)) continue;
    for (const entry of content) {
      const contentRecord = asRecord(entry);
      const text =
        typeof contentRecord?.text === "string"
          ? contentRecord.text
          : typeof contentRecord?.output_text === "string"
            ? contentRecord.output_text
            : null;
      if (text) {
        collected.push(text);
      }
    }
  }

  if (collected.length === 0) return null;
  return collected.join("\n").trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return null;
}
