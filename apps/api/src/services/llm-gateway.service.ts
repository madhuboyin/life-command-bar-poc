import {
  LlmCallStatus,
  LlmModelTier,
  LlmTaskType,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { prisma } from "../clients/prisma.client";
import { AppError } from "../utils/app-error";
import { LlmBudgetService } from "./llm-budget.service";
import { LlmCacheService } from "./llm-cache.service";
import { LlmProviderService } from "./llm-provider.service";
import { LlmRouter, type LlmRoute } from "./llm-router";
import { getTaskProfile } from "./llm-task-types";
import { LlmUsageTracker, estimateLlmCostUsd } from "./llm-usage-tracker";
import { buildPrompt } from "./prompt-builder";
import { buildPromptCacheKey } from "./prompt-cache-key";

export type LlmGatewayRequest<T> = {
  userId: string;
  householdId?: string | null;
  taskType: LlmTaskType;
  input: Record<string, unknown>;
  deterministicGate?: {
    shouldCallLlm: boolean;
    reason: string;
    confidence?: number;
  };
  fallbackOutput?: T | null;
  schema?: z.ZodType<T>;
  instructions?: string;
  outputContract?: Record<string, unknown>;
  parserVersion?: string;
  promptVersion?: string;
  requestedTier?: LlmModelTier;
  complexityScore?: number;
  businessImpact?: "LOW" | "MEDIUM" | "HIGH";
  templateHint?: string | null;
  disableCache?: boolean;
  preferAsync?: boolean;
  maxOutputTokens?: number;
  metadata?: Prisma.InputJsonValue;
};

export type LlmGatewayResult<T> = {
  status:
    | "SKIPPED_BY_GATE"
    | "SKIPPED_BY_BUDGET"
    | "CACHE_HIT"
    | "ASYNC_ENQUEUED"
    | "COMPLETED"
    | "FAILED_FALLBACK"
    | "FAILED";
  resolvedBy: "DETERMINISTIC" | "CACHE" | "ASYNC_QUEUE" | "PROVIDER" | "FALLBACK";
  output: T | null;
  route: LlmRoute;
  usageRecordId: string | null;
  cache: {
    hit: boolean;
    cacheKey: string;
    cacheEntryId: string | null;
  };
  reasons: string[];
};

export class LlmGatewayService {
  private readonly router = new LlmRouter();
  private readonly cacheService = new LlmCacheService();
  private readonly budgetService = new LlmBudgetService();
  private readonly usageTracker = new LlmUsageTracker();
  private readonly provider = new LlmProviderService();

  async execute<T>(request: LlmGatewayRequest<T>): Promise<LlmGatewayResult<T>> {
    const profile = getTaskProfile(request.taskType);
    const promptVersion = request.promptVersion ?? "v1";
    const parserVersion = request.parserVersion ?? "v1";
    const gate = request.deterministicGate ?? {
      shouldCallLlm: true,
      reason: "no_deterministic_gate"
    };

    await this.usageTracker.emitRequestedEvent({
      userId: request.userId,
      householdId: request.householdId ?? null,
      taskType: request.taskType,
      metadata: {
        reason: gate.reason,
        complexityScore: request.complexityScore ?? null
      }
    });

    let route = this.router.route({
      taskType: request.taskType,
      complexityScore: request.complexityScore,
      businessImpact: request.businessImpact,
      requestedTier: request.requestedTier
    });

    const prompt = buildPrompt({
      taskType: request.taskType,
      promptVersion,
      payload: {
        instructions: request.instructions ?? null,
        outputContract: request.outputContract ?? null,
        taskInput: request.input
      }
    });

    const cacheKeys = buildPromptCacheKey({
      taskType: request.taskType,
      cacheStrategy: profile.cacheStrategy,
      promptFamily: prompt.family,
      promptVersion,
      parserVersion,
      userId: request.userId,
      householdId: request.householdId ?? null,
      modelKey: route.modelKey,
      normalizedInput: request.input,
      templateHint: request.templateHint ?? null
    });

    if (!gate.shouldCallLlm) {
      await this.usageTracker.emitEvent({
        userId: request.userId,
        householdId: request.householdId ?? null,
        eventType: "llm_call_skipped_by_gate",
        metadata: {
          taskType: request.taskType,
          reason: gate.reason
        }
      });
      const usage = await this.usageTracker.track({
        userId: request.userId,
        householdId: request.householdId ?? null,
        taskType: request.taskType,
        status: LlmCallStatus.SKIPPED,
        providerKey: route.providerKey,
        modelKey: route.modelKey,
        modelTier: route.modelTier,
        cacheHit: false,
        gateSkipped: true,
        rationale: {
          reason: gate.reason
        },
        metadata: request.metadata
      });

      return {
        status: "SKIPPED_BY_GATE",
        resolvedBy: "DETERMINISTIC",
        output: request.fallbackOutput ?? null,
        route,
        usageRecordId: usage.id,
        cache: {
          hit: false,
          cacheKey: cacheKeys.cacheKey,
          cacheEntryId: null
        },
        reasons: [gate.reason]
      };
    }

    const budget = await this.budgetService.evaluate({
      userId: request.userId,
      householdId: request.householdId ?? null,
      taskType: request.taskType,
      modelTier: route.modelTier
    });

    if (budget.reasons.length > 0) {
      await this.usageTracker.emitEvent({
        userId: request.userId,
        householdId: request.householdId ?? null,
        eventType: "llm_budget_soft_limit_hit",
        metadata: {
          taskType: request.taskType,
          reasons: budget.reasons,
          usage: budget.usage,
          limits: budget.limits
        }
      });
    }

    if (!budget.proceed) {
      const usage = await this.usageTracker.track({
        userId: request.userId,
        householdId: request.householdId ?? null,
        taskType: request.taskType,
        status: LlmCallStatus.SKIPPED,
        providerKey: route.providerKey,
        modelKey: route.modelKey,
        modelTier: route.modelTier,
        cacheHit: false,
        gateSkipped: true,
        rationale: {
          reason: "budget_control",
          budgetReasons: budget.reasons
        },
        metadata: request.metadata
      });

      return {
        status: "SKIPPED_BY_BUDGET",
        resolvedBy: "DETERMINISTIC",
        output: request.fallbackOutput ?? null,
        route,
        usageRecordId: usage.id,
        cache: {
          hit: false,
          cacheKey: cacheKeys.cacheKey,
          cacheEntryId: null
        },
        reasons: budget.reasons.length > 0 ? budget.reasons : ["budget_control"]
      };
    }

    if (budget.downgradeToLowCost) {
      route = this.router.route({
        taskType: request.taskType,
        complexityScore: request.complexityScore,
        businessImpact: request.businessImpact,
        requestedTier: request.requestedTier,
        downgradeToLowCost: true
      });
    }

    await this.usageTracker.emitEvent({
      userId: request.userId,
      householdId: request.householdId ?? null,
      eventType: "llm_model_routed",
      metadata: {
        taskType: request.taskType,
        modelTier: route.modelTier,
        modelKey: route.modelKey,
        providerKey: route.providerKey,
        downgraded: budget.downgradeToLowCost
      }
    });

    if (profile.cacheable && !request.disableCache) {
      const cached = await this.cacheService.getValidEntry({
        taskType: request.taskType,
        cacheKey: cacheKeys.cacheKey,
        modelKey: route.modelKey,
        promptVersion,
        parserVersion
      });

      if (cached) {
        const parsedCache = this.parseOutput(request.schema, cached.output, "cache_output_invalid");
        if (parsedCache.ok) {
          await this.usageTracker.emitEvent({
            userId: request.userId,
            householdId: request.householdId ?? null,
            eventType: "llm_cache_hit",
            metadata: {
              taskType: request.taskType,
              cacheEntryId: cached.id
            }
          });

          const usage = await this.usageTracker.track({
            userId: request.userId,
            householdId: request.householdId ?? null,
            taskType: request.taskType,
            status: LlmCallStatus.COMPLETED,
            providerKey: route.providerKey,
            modelKey: route.modelKey,
            modelTier: route.modelTier,
            cacheHit: true,
            gateSkipped: false,
            totalTokens: 0,
            estimatedCostUsd: 0,
            rationale: {
              source: "cache_hit"
            },
            metadata: request.metadata,
            cacheEntryId: cached.id
          });

          return {
            status: "CACHE_HIT",
            resolvedBy: "CACHE",
            output: parsedCache.value,
            route,
            usageRecordId: usage.id,
            cache: {
              hit: true,
              cacheKey: cacheKeys.cacheKey,
              cacheEntryId: cached.id
            },
            reasons: ["cache_hit"]
          };
        }

        await this.cacheService.invalidate({
          userId: request.userId,
          householdId: request.householdId ?? null,
          taskType: request.taskType,
          reason: "invalid_cached_payload"
        });
      }

      await this.usageTracker.emitEvent({
        userId: request.userId,
        householdId: request.householdId ?? null,
        eventType: "llm_cache_miss",
        metadata: {
          taskType: request.taskType,
          cacheKey: cacheKeys.cacheKey
        }
      });
    }

    if (request.preferAsync && profile.asyncAllowed) {
      const usage = await this.usageTracker.track({
        userId: request.userId,
        householdId: request.householdId ?? null,
        taskType: request.taskType,
        status: LlmCallStatus.REQUESTED,
        providerKey: route.providerKey,
        modelKey: route.modelKey,
        modelTier: route.modelTier,
        cacheHit: false,
        gateSkipped: false,
        rationale: {
          source: "async_queue"
        },
        metadata: request.metadata
      });

      await prisma.llmAsyncTask.create({
        data: {
          userId: request.userId,
          householdId: request.householdId ?? null,
          taskType: request.taskType,
          payload: {
            request: {
              taskType: request.taskType,
              input: sanitizeJsonValue(request.input),
              instructions: request.instructions ?? null,
              outputContract: sanitizeJsonValue(request.outputContract ?? null),
              parserVersion,
              promptVersion,
              requestedTier: request.requestedTier ?? null,
              complexityScore: request.complexityScore ?? null,
              businessImpact: request.businessImpact ?? null,
              templateHint: request.templateHint ?? null,
              maxOutputTokens: request.maxOutputTokens ?? null
            }
          } as Prisma.InputJsonValue,
          metadata: request.metadata,
          usageRecordId: usage.id
        }
      });

      await this.usageTracker.emitEvent({
        userId: request.userId,
        householdId: request.householdId ?? null,
        eventType: "llm_async_task_enqueued",
        metadata: {
          taskType: request.taskType,
          usageRecordId: usage.id
        }
      });

      return {
        status: "ASYNC_ENQUEUED",
        resolvedBy: "ASYNC_QUEUE",
        output: request.fallbackOutput ?? null,
        route,
        usageRecordId: usage.id,
        cache: {
          hit: false,
          cacheKey: cacheKeys.cacheKey,
          cacheEntryId: null
        },
        reasons: ["async_enqueued"]
      };
    }

    if (!route.providerAvailable) {
      return this.handleFailure({
        request,
        route,
        cacheKey: cacheKeys.cacheKey,
        reason: "provider_unavailable"
      });
    }

    const startedAt = Date.now();
    try {
      const providerResult = await this.provider.call({
        route,
        systemPrompt: prompt.systemPrefix,
        userPrompt: prompt.userPrompt,
        maxOutputTokens: request.maxOutputTokens
      });
      const latencyMs = Date.now() - startedAt;

      if (providerResult.promptCacheHit) {
        await this.usageTracker.emitEvent({
          userId: request.userId,
          householdId: request.householdId ?? null,
          eventType: "llm_provider_prompt_cache_hit_if_available",
          metadata: {
            taskType: request.taskType,
            providerKey: route.providerKey,
            modelKey: route.modelKey
          }
        });
      }

      const parsedRaw = parseJsonFromText(providerResult.text);
      const parsed = this.parseOutput(
        request.schema,
        parsedRaw,
        "provider_output_schema_validation_failed"
      );
      if (!parsed.ok) {
        throw parsed.error;
      }

      let cacheEntryId: string | null = null;
      if (profile.cacheable && !request.disableCache) {
        const cacheEntry = await this.cacheService.putEntry({
          userId: request.userId,
          householdId: request.householdId ?? null,
          taskType: request.taskType,
          cacheStrategy: profile.cacheStrategy,
          cacheKey: cacheKeys.cacheKey,
          inputHash: cacheKeys.inputHash,
          modelKey: route.modelKey,
          providerKey: route.providerKey,
          modelTier: route.modelTier,
          promptVersion,
          parserVersion,
          output: sanitizeJsonValue(parsed.value),
          metadata: {
            promptFamily: profile.promptFamily,
            promptVersion,
            parserVersion
          },
          ttlSeconds: profile.cacheTtlSeconds
        });
        cacheEntryId = cacheEntry.id;
      }

      const estimatedCostUsd = estimateLlmCostUsd({
        modelTier: route.modelTier,
        promptTokens: providerResult.promptTokens,
        completionTokens: providerResult.completionTokens
      });

      const usage = await this.usageTracker.track({
        userId: request.userId,
        householdId: request.householdId ?? null,
        taskType: request.taskType,
        status: LlmCallStatus.COMPLETED,
        providerKey: route.providerKey,
        modelKey: route.modelKey,
        modelTier: route.modelTier,
        cacheHit: false,
        promptCacheHit: providerResult.promptCacheHit,
        gateSkipped: false,
        promptTokens: providerResult.promptTokens,
        completionTokens: providerResult.completionTokens,
        totalTokens: providerResult.totalTokens,
        estimatedCostUsd,
        latencyMs,
        rationale: {
          source: "provider",
          promptFamily: profile.promptFamily
        },
        metadata: request.metadata,
        cacheEntryId
      });

      await this.usageTracker.emitEvent({
        userId: request.userId,
        householdId: request.householdId ?? null,
        eventType: "llm_call_completed",
        metadata: {
          taskType: request.taskType,
          modelKey: route.modelKey,
          modelTier: route.modelTier,
          latencyMs,
          cacheStored: Boolean(cacheEntryId)
        }
      });

      return {
        status: "COMPLETED",
        resolvedBy: "PROVIDER",
        output: parsed.value,
        route,
        usageRecordId: usage.id,
        cache: {
          hit: false,
          cacheKey: cacheKeys.cacheKey,
          cacheEntryId
        },
        reasons: ["provider_completed"]
      };
    } catch (error) {
      return this.handleFailure({
        request,
        route,
        cacheKey: cacheKeys.cacheKey,
        reason: error instanceof Error ? error.message : "llm_call_failed"
      });
    }
  }

  private async handleFailure<T>(input: {
    request: LlmGatewayRequest<T>;
    route: LlmRoute;
    cacheKey: string;
    reason: string;
  }): Promise<LlmGatewayResult<T>> {
    await this.usageTracker.emitEvent({
      userId: input.request.userId,
      householdId: input.request.householdId ?? null,
      eventType: "llm_call_failed",
      metadata: {
        taskType: input.request.taskType,
        reason: input.reason,
        modelKey: input.route.modelKey,
        providerKey: input.route.providerKey
      }
    });

    const usage = await this.usageTracker.track({
      userId: input.request.userId,
      householdId: input.request.householdId ?? null,
      taskType: input.request.taskType,
      status: LlmCallStatus.FAILED,
      providerKey: input.route.providerKey,
      modelKey: input.route.modelKey,
      modelTier: input.route.modelTier,
      cacheHit: false,
      gateSkipped: false,
      rationale: {
        source: "failure",
        reason: input.reason
      },
      metadata: input.request.metadata
    });

    if (input.request.fallbackOutput !== undefined) {
      return {
        status: "FAILED_FALLBACK",
        resolvedBy: "FALLBACK",
        output: input.request.fallbackOutput ?? null,
        route: input.route,
        usageRecordId: usage.id,
        cache: {
          hit: false,
          cacheKey: input.cacheKey,
          cacheEntryId: null
        },
        reasons: [input.reason]
      };
    }

    return {
      status: "FAILED",
      resolvedBy: "FALLBACK",
      output: null,
      route: input.route,
      usageRecordId: usage.id,
      cache: {
        hit: false,
        cacheKey: input.cacheKey,
        cacheEntryId: null
      },
      reasons: [input.reason]
    };
  }

  private parseOutput<T>(
    schema: z.ZodType<T> | undefined,
    value: unknown,
    errorCode: string
  ):
    | {
        ok: true;
        value: T;
      }
    | {
        ok: false;
        error: AppError;
      } {
    if (!schema) {
      return {
        ok: true,
        value: value as T
      };
    }

    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      return {
        ok: false,
        error: new AppError("LLM_SCHEMA_VALIDATION_FAILED", "LLM output schema validation failed", 422, {
          errorCode,
          issues: parsed.error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path.join("."),
            message: issue.message
          }))
        })
      };
    }

    return {
      ok: true,
      value: parsed.data
    };
  }
}

function parseJsonFromText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(candidate) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function sanitizeJsonValue(value: unknown): Prisma.InputJsonValue {
  const normalized = sanitizeJsonEntry(value);
  if (normalized === null) {
    return {} as Prisma.InputJsonObject;
  }
  return normalized;
}

function sanitizeJsonEntry(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonEntry(entry)) as Prisma.InputJsonArray;
  }
  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const output: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entry] of Object.entries(objectValue)) {
      if (entry === undefined) continue;
      output[key] = sanitizeJsonEntry(entry);
    }
    return output as Prisma.InputJsonObject;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}
