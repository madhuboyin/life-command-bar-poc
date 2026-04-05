import { LlmModelTier, LlmTaskType } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { getTaskProfile } from "./llm-task-types";

export type LlmBudgetDecision = {
  proceed: boolean;
  downgradeToLowCost: boolean;
  reasons: string[];
  usage: {
    userDailyUsd: number;
    userMonthlyUsd: number;
    taskDailyUsd: number;
  };
  limits: {
    userDailyUsd: number;
    userMonthlyUsd: number;
    taskDailyUsd: number;
  };
};

export class LlmBudgetService {
  async evaluate(input: {
    userId: string;
    householdId?: string | null;
    taskType: LlmTaskType;
    modelTier: LlmModelTier;
  }): Promise<LlmBudgetDecision> {
    const profile = getTaskProfile(input.taskType);
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    );
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

    const [userDaily, userMonthly, taskDaily] = await Promise.all([
      prisma.llmUsageRecord.aggregate({
        where: {
          userId: input.userId,
          householdId: input.householdId ?? undefined,
          createdAt: { gte: startOfDay }
        },
        _sum: {
          estimatedCostUsd: true
        }
      }),
      prisma.llmUsageRecord.aggregate({
        where: {
          userId: input.userId,
          householdId: input.householdId ?? undefined,
          createdAt: { gte: startOfMonth }
        },
        _sum: {
          estimatedCostUsd: true
        }
      }),
      prisma.llmUsageRecord.aggregate({
        where: {
          userId: input.userId,
          householdId: input.householdId ?? undefined,
          taskType: input.taskType,
          createdAt: { gte: startOfDay }
        },
        _sum: {
          estimatedCostUsd: true
        }
      })
    ]);

    const userDailyUsd = Number(userDaily._sum.estimatedCostUsd ?? 0);
    const userMonthlyUsd = Number(userMonthly._sum.estimatedCostUsd ?? 0);
    const taskDailyUsd = Number(taskDaily._sum.estimatedCostUsd ?? 0);

    const limits = {
      userDailyUsd: readBudget("LLM_BUDGET_USER_DAILY_USD", 1.5),
      userMonthlyUsd: readBudget("LLM_BUDGET_USER_MONTHLY_USD", 25),
      taskDailyUsd: readBudget("LLM_BUDGET_TASK_DAILY_USD", Math.max(0.2, profile.maxCostUsd * 40))
    };

    const reasons: string[] = [];
    let proceed = true;
    let downgradeToLowCost = false;

    if (userMonthlyUsd >= limits.userMonthlyUsd || userDailyUsd >= limits.userDailyUsd * 1.05) {
      reasons.push("soft_limit_exceeded");
      if (profile.deterministicFallbackAvailable) {
        proceed = false;
      } else {
        downgradeToLowCost = input.modelTier !== LlmModelTier.TIER_LOW_COST;
      }
    } else {
      const userDailyRatio = ratio(userDailyUsd, limits.userDailyUsd);
      const userMonthlyRatio = ratio(userMonthlyUsd, limits.userMonthlyUsd);
      const taskDailyRatio = ratio(taskDailyUsd, limits.taskDailyUsd);
      const highestRatio = Math.max(userDailyRatio, userMonthlyRatio, taskDailyRatio);
      if (highestRatio >= 0.82) {
        reasons.push("soft_limit_near");
      }
      if (
        highestRatio >= 0.9 &&
        input.modelTier !== LlmModelTier.TIER_LOW_COST &&
        profile.deterministicFallbackAvailable
      ) {
        downgradeToLowCost = true;
        reasons.push("downgraded_to_low_cost_tier");
      }
      if (taskDailyUsd >= limits.taskDailyUsd * 1.15 && profile.deterministicFallbackAvailable) {
        proceed = false;
        reasons.push("task_budget_exceeded");
      }
    }

    return {
      proceed,
      downgradeToLowCost,
      reasons,
      usage: {
        userDailyUsd,
        userMonthlyUsd,
        taskDailyUsd
      },
      limits
    };
  }
}

function readBudget(key: string, fallback: number) {
  const raw = (process.env[key] || "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function ratio(current: number, limit: number) {
  if (limit <= 0) return 0;
  return current / limit;
}
