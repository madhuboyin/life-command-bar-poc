import { ZeroInputAutonomyTier } from "@prisma/client";
import { z } from "zod";
import { ZeroInputRepository } from "../repositories/zero-input.repository";

const updatePolicySchema = z
  .object({
    modeEnabled: z.boolean().optional(),
    autonomyTier: z
      .enum(["OBSERVE_ONLY", "PREPARE_ONLY", "SAFE_AUTOMATION"])
      .optional(),
    allowRecurringPromotion: z.boolean().optional(),
    allowReminderAutocreate: z.boolean().optional(),
    allowDuplicateSuppression: z.boolean().optional(),
    allowAutoFlowPreparation: z.boolean().optional(),
    allowPredictionPromotion: z.boolean().optional(),
    requireApprovalForFinancialItems: z.boolean().optional(),
    requireApprovalForLowConfidence: z.boolean().optional(),
    quietHoursStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    quietHoursEnd: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable()
      .optional()
  })
  .strict();

export type ZeroInputPolicyPayload = {
  id: string;
  userId: string;
  modeEnabled: boolean;
  autonomyTier: ZeroInputAutonomyTier;
  allowRecurringPromotion: boolean;
  allowReminderAutocreate: boolean;
  allowDuplicateSuppression: boolean;
  allowAutoFlowPreparation: boolean;
  allowPredictionPromotion: boolean;
  requireApprovalForFinancialItems: boolean;
  requireApprovalForLowConfidence: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ZeroInputPolicyService {
  private readonly repository = new ZeroInputRepository();

  async getPolicy(userId: string): Promise<ZeroInputPolicyPayload> {
    const policy = await this.ensurePolicy(userId);
    return toPolicyPayload(policy);
  }

  async patchPolicy(userId: string, payload: unknown): Promise<ZeroInputPolicyPayload> {
    const input = updatePolicySchema.parse(payload ?? {});
    const updated = await this.repository.upsertPolicy(userId, {
      ...input,
      autonomyTier: input.autonomyTier
    });
    return toPolicyPayload(updated);
  }

  async ensurePolicy(userId: string) {
    const existing = await this.repository.getPolicy(userId);
    if (existing) return existing;
    return this.repository.upsertPolicy(userId, {});
  }
}

function toPolicyPayload(
  policy: NonNullable<Awaited<ReturnType<ZeroInputRepository["getPolicy"]>>>
) {
  return {
    id: policy.id,
    userId: policy.userId,
    modeEnabled: policy.modeEnabled,
    autonomyTier: policy.autonomyTier,
    allowRecurringPromotion: policy.allowRecurringPromotion,
    allowReminderAutocreate: policy.allowReminderAutocreate,
    allowDuplicateSuppression: policy.allowDuplicateSuppression,
    allowAutoFlowPreparation: policy.allowAutoFlowPreparation,
    allowPredictionPromotion: policy.allowPredictionPromotion,
    requireApprovalForFinancialItems: policy.requireApprovalForFinancialItems,
    requireApprovalForLowConfidence: policy.requireApprovalForLowConfidence,
    quietHoursStart: policy.quietHoursStart,
    quietHoursEnd: policy.quietHoursEnd,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString()
  };
}
