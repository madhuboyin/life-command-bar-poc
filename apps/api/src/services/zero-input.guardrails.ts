import { ZeroInputActionType, ZeroInputAutonomyTier } from "@prisma/client";
import { toConfidenceBand } from "../utils/trust-layer";
import type { ZeroInputPolicyPayload } from "./zero-input.policy";

export type ZeroInputOutcome = "EXECUTE" | "APPROVAL_REQUIRED" | "REVIEW" | "SUPPRESS";

export type ZeroInputGuardrailInput = {
  policy: ZeroInputPolicyPayload;
  action: ZeroInputActionType;
  actionAllowed: boolean;
  confidenceScore: number;
  isFinancial: boolean;
  isDuplicate: boolean;
  hasConflict: boolean;
  recentCorrection: boolean;
  isPreparationAction?: boolean;
};

export type ZeroInputGuardrailResult = {
  outcome: ZeroInputOutcome;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  results: {
    modeEnabled: boolean;
    autonomyTier: ZeroInputAutonomyTier;
    actionAllowed: boolean;
    confidenceScore: number;
    confidenceBand: "HIGH" | "MEDIUM" | "LOW";
    duplicateDetected: boolean;
    conflictDetected: boolean;
    recentCorrection: boolean;
    financialSensitive: boolean;
    lowConfidence: boolean;
    requiresApprovalForFinancialItems: boolean;
    requiresApprovalForLowConfidence: boolean;
  };
};

export class ZeroInputGuardrails {
  evaluate(input: ZeroInputGuardrailInput): ZeroInputGuardrailResult {
    const confidenceBand = toConfidenceBand(input.confidenceScore);
    const lowConfidence = confidenceBand !== "HIGH";
    const reasons: string[] = [];

    if (!input.policy.modeEnabled) {
      reasons.push("mode_disabled");
      return this.result("SUPPRESS", confidenceBand, reasons, input, lowConfidence);
    }

    if (!input.actionAllowed) {
      reasons.push("action_disabled_by_policy");
      return this.result("SUPPRESS", confidenceBand, reasons, input, lowConfidence);
    }

    if (input.hasConflict) {
      reasons.push("conflict_detected");
      return this.result("REVIEW", confidenceBand, reasons, input, lowConfidence);
    }

    if (input.recentCorrection) {
      reasons.push("recent_user_correction");
      return this.result("REVIEW", confidenceBand, reasons, input, lowConfidence);
    }

    if (input.isDuplicate) {
      if (
        input.policy.allowDuplicateSuppression &&
        input.policy.autonomyTier === ZeroInputAutonomyTier.SAFE_AUTOMATION
      ) {
        reasons.push("duplicate_suppressed");
        return this.result("EXECUTE", confidenceBand, reasons, input, lowConfidence);
      }
      reasons.push("duplicate_needs_review");
      return this.result("REVIEW", confidenceBand, reasons, input, lowConfidence);
    }

    if (input.policy.requireApprovalForLowConfidence && lowConfidence) {
      reasons.push("low_confidence_requires_approval");
      return this.result("APPROVAL_REQUIRED", confidenceBand, reasons, input, lowConfidence);
    }

    if (
      input.isFinancial &&
      input.policy.requireApprovalForFinancialItems &&
      input.confidenceScore < 0.92
    ) {
      reasons.push("financial_requires_approval");
      return this.result("APPROVAL_REQUIRED", confidenceBand, reasons, input, lowConfidence);
    }

    if (input.policy.autonomyTier === ZeroInputAutonomyTier.OBSERVE_ONLY) {
      reasons.push("observe_only_tier");
      return this.result("REVIEW", confidenceBand, reasons, input, lowConfidence);
    }

    if (
      input.policy.autonomyTier === ZeroInputAutonomyTier.PREPARE_ONLY &&
      !input.isPreparationAction
    ) {
      reasons.push("prepare_only_tier");
      return this.result("REVIEW", confidenceBand, reasons, input, lowConfidence);
    }

    reasons.push("passes_guardrails");
    return this.result("EXECUTE", confidenceBand, reasons, input, lowConfidence);
  }

  private result(
    outcome: ZeroInputOutcome,
    confidenceBand: "HIGH" | "MEDIUM" | "LOW",
    reasons: string[],
    input: ZeroInputGuardrailInput,
    lowConfidence: boolean
  ): ZeroInputGuardrailResult {
    return {
      outcome,
      confidenceBand,
      reasons,
      results: {
        modeEnabled: input.policy.modeEnabled,
        autonomyTier: input.policy.autonomyTier,
        actionAllowed: input.actionAllowed,
        confidenceScore: input.confidenceScore,
        confidenceBand,
        duplicateDetected: input.isDuplicate,
        conflictDetected: input.hasConflict,
        recentCorrection: input.recentCorrection,
        financialSensitive: input.isFinancial,
        lowConfidence,
        requiresApprovalForFinancialItems: input.policy.requireApprovalForFinancialItems,
        requiresApprovalForLowConfidence: input.policy.requireApprovalForLowConfidence
      }
    };
  }
}
