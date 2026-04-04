import {
  ObligationStatus,
  Prisma,
  ZeroInputActionType,
  ZeroInputApprovalStatus,
  ZeroInputDecision
} from "@prisma/client";
import { z } from "zod";
import {
  type AutonomyDecisionWithRelations,
  ZeroInputRepository
} from "../repositories/zero-input.repository";
import { mapObligation } from "../utils/obligation.mapper";
import { toConfidenceBand } from "../utils/trust-layer";
import { AppError } from "../utils/app-error";
import { ZeroInputExecutor } from "./zero-input.executor";
import { ZeroInputGuardrails } from "./zero-input.guardrails";
import { ZeroInputPolicyService } from "./zero-input.policy";

const decisionFiltersSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  decision: z
    .array(z.enum(["EXECUTED", "REVIEW", "APPROVAL_REQUIRED", "SUPPRESSED"]))
    .optional(),
  approvalStatus: z
    .array(z.enum(["NONE", "PENDING", "APPROVED", "REJECTED", "EXPIRED", "UNDONE"]))
    .optional()
});

const approvePayloadSchema = z.object({
  note: z.string().max(400).optional(),
  dontAutoDoSimilar: z.boolean().optional()
});

const rejectPayloadSchema = z.object({
  reason: z.string().max(400).optional(),
  dontAutoDoSimilar: z.boolean().optional()
});

const undoPayloadSchema = z.object({
  reason: z.string().max(400).optional()
});

type IngestionEvaluationInput = {
  userId: string;
  channel: string;
  importSourceId: string;
  obligationId: string | null;
  status: "ACTIVE" | "DRAFT" | "NO_CANDIDATE" | "DUPLICATE";
  confidence: number;
  duplicateCandidate: boolean;
  conflictDetected: boolean;
  needsReview: boolean;
  extracted: {
    type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
    title: string | null;
    vendor: string | null;
    amount: number | null;
    dueDate: string | null;
  };
};

type DecisionPayload = {
  id: string;
  title: string;
  description: string | null;
  sourceType: string;
  referenceType: string;
  referenceId: string | null;
  candidateAction: ZeroInputActionType;
  decision: ZeroInputDecision;
  approvalStatus: ZeroInputApprovalStatus;
  confidenceScore: number;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  rationale: Record<string, unknown> | null;
  guardrailResults: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  obligationId: string | null;
  predictionId: string | null;
  reminderId: string | null;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  undoneAt: string | null;
  undoReason: string | null;
  canApprove: boolean;
  canReject: boolean;
  canUndo: boolean;
  obligation: ReturnType<typeof mapObligation> | null;
  prediction: {
    id: string;
    title: string;
    description: string | null;
    predictionType: string;
    predictedDate: string | null;
    confidenceScore: number;
    confidenceBand: "HIGH" | "MEDIUM" | "LOW";
    status: string;
    promotedObligationId: string | null;
  } | null;
  reminder: {
    id: string;
    title: string;
    scheduledFor: string;
    status: string;
  } | null;
};

export class ZeroInputService {
  private readonly repository = new ZeroInputRepository();
  private readonly policyService = new ZeroInputPolicyService();
  private readonly guardrails = new ZeroInputGuardrails();
  private readonly executor = new ZeroInputExecutor();

  async getPolicy(userId: string) {
    return this.policyService.getPolicy(userId);
  }

  async patchPolicy(userId: string, payload: unknown) {
    const updated = await this.policyService.patchPolicy(userId, payload);
    await this.repository.createAuditEvent({
      userId,
      eventType: "zero_input_policy_updated",
      metadata: {
        autonomyTier: updated.autonomyTier,
        modeEnabled: updated.modeEnabled
      }
    });
    return updated;
  }

  async listDecisions(userId: string, query?: {
    limit?: number;
    decision?: Array<"EXECUTED" | "REVIEW" | "APPROVAL_REQUIRED" | "SUPPRESSED">;
    approvalStatus?: Array<"NONE" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "UNDONE">;
  }) {
    const filters = decisionFiltersSchema.parse(query ?? {});
    const rows = await this.repository.listDecisions({
      userId,
      limit: filters.limit ?? 50,
      decision: filters.decision,
      approvalStatus: filters.approvalStatus
    });

    return {
      items: rows.map((row) => this.toDecisionPayload(row))
    };
  }

  async listApprovals(userId: string, limit = 30) {
    const rows = await this.repository.listPendingApprovals(userId, Math.max(1, Math.min(limit, 100)));
    return {
      items: rows.map((row) => this.toDecisionPayload(row))
    };
  }

  async approve(userId: string, decisionId: string, payload: unknown) {
    const input = approvePayloadSchema.parse(payload ?? {});
    const decision = await this.repository.findDecisionByIdForUser(userId, decisionId);
    if (!decision) return null;

    if (
      decision.decision !== ZeroInputDecision.APPROVAL_REQUIRED ||
      decision.approvalStatus !== ZeroInputApprovalStatus.PENDING
    ) {
      throw new AppError("VALIDATION_ERROR", "Decision is not awaiting approval", 400);
    }

    const policy = await this.policyService.ensurePolicy(userId);
    const execution = await this.executor.execute({
      userId,
      action: decision.candidateAction,
      obligationId: decision.obligationId,
      predictionId: decision.predictionId,
      title: this.resolveReminderTitle(decision),
      dueDate: this.resolveDueDate(decision),
      scheduledFor: this.resolveScheduledFor(decision),
      policy: {
        ...policy,
        createdAt: policy.createdAt.toISOString(),
        updatedAt: policy.updatedAt.toISOString()
      },
      reason: `approval:${decision.id}`
    });

    const updated = await this.repository.updateDecision(decision.id, {
      decision: ZeroInputDecision.EXECUTED,
      approvalStatus: ZeroInputApprovalStatus.APPROVED,
      approvedAt: new Date(),
      executedAt: execution.executed ? new Date() : undefined,
      obligationId:
        "obligationId" in execution && execution.obligationId
          ? execution.obligationId
          : decision.obligationId,
      reminderId:
        "reminderId" in execution && execution.reminderId
          ? execution.reminderId
          : decision.reminderId,
      metadata: mergeJson(decision.metadata, {
        approvalNote: input.note ?? null,
        dontAutoDoSimilar: Boolean(input.dontAutoDoSimilar),
        executedFromApproval: execution.executed
      }) as Prisma.InputJsonValue
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId: updated.obligationId,
      eventType: "zero_input_approval_approved",
      metadata: {
        decisionId: updated.id,
        candidateAction: updated.candidateAction
      }
    });

    return this.toDecisionPayload(updated);
  }

  async reject(userId: string, decisionId: string, payload: unknown) {
    const input = rejectPayloadSchema.parse(payload ?? {});
    const decision = await this.repository.findDecisionByIdForUser(userId, decisionId);
    if (!decision) return null;

    if (
      decision.decision !== ZeroInputDecision.APPROVAL_REQUIRED ||
      decision.approvalStatus !== ZeroInputApprovalStatus.PENDING
    ) {
      throw new AppError("VALIDATION_ERROR", "Decision is not awaiting approval", 400);
    }

    if (input.dontAutoDoSimilar) {
      if (decision.obligationId) {
        await this.repository.createFeedbackEvent({
          userId,
          obligationId: decision.obligationId,
          type: "DONT_SHOW_AGAIN",
          note: "User rejected autonomous action and requested suppression."
        });
      }
    }

    const updated = await this.repository.updateDecision(decision.id, {
      approvalStatus: ZeroInputApprovalStatus.REJECTED,
      rejectedAt: new Date(),
      metadata: mergeJson(decision.metadata, {
        rejectionReason: input.reason ?? null,
        dontAutoDoSimilar: Boolean(input.dontAutoDoSimilar)
      }) as Prisma.InputJsonValue
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId: updated.obligationId,
      eventType: "zero_input_approval_rejected",
      metadata: {
        decisionId: updated.id,
        candidateAction: updated.candidateAction,
        reason: input.reason ?? null
      }
    });

    return this.toDecisionPayload(updated);
  }

  async undo(userId: string, decisionId: string, payload: unknown) {
    const input = undoPayloadSchema.parse(payload ?? {});
    const decision = await this.repository.findDecisionByIdForUser(userId, decisionId);
    if (!decision) return null;

    if (decision.decision !== ZeroInputDecision.EXECUTED) {
      throw new AppError("VALIDATION_ERROR", "Only executed decisions can be undone", 400);
    }
    if (decision.approvalStatus === ZeroInputApprovalStatus.UNDONE || decision.undoneAt) {
      throw new AppError("VALIDATION_ERROR", "Decision is already undone", 400);
    }

    const result = await this.executor.undo({
      userId,
      action: decision.candidateAction,
      obligationId: decision.obligationId,
      reminderId: decision.reminderId,
      reason: input.reason ?? null
    });

    if (!result.undone) {
      throw new AppError("VALIDATION_ERROR", "This action cannot be undone safely", 400);
    }

    const updated = await this.repository.updateDecision(decision.id, {
      approvalStatus: ZeroInputApprovalStatus.UNDONE,
      undoneAt: new Date(),
      undoReason: input.reason ?? null
    });

    await this.repository.createAuditEvent({
      userId,
      obligationId: updated.obligationId,
      eventType: "zero_input_decision_undone",
      metadata: {
        decisionId: updated.id,
        candidateAction: updated.candidateAction,
        reason: input.reason ?? null
      }
    });

    return this.toDecisionPayload(updated);
  }

  async evaluateIngestionResult(input: IngestionEvaluationInput) {
    const policy = await this.policyService.ensurePolicy(input.userId);
    const policyPayload = {
      ...policy,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString()
    };

    if (input.duplicateCandidate) {
      const guardrail = this.guardrails.evaluate({
        policy: policyPayload,
        action: ZeroInputActionType.SUPPRESS_DUPLICATE,
        actionAllowed: policy.allowDuplicateSuppression,
        confidenceScore: input.confidence,
        isFinancial: false,
        isDuplicate: true,
        hasConflict: false,
        recentCorrection: false,
        isPreparationAction: true
      });

      return this.persistDecision({
        userId: input.userId,
        action: ZeroInputActionType.SUPPRESS_DUPLICATE,
        guardrail,
        sourceType: `ingestion:${input.channel.toLowerCase()}`,
        referenceType: input.obligationId ? "obligation" : "import_source",
        referenceId: input.obligationId ?? input.importSourceId,
        obligationId: input.obligationId,
        title: "Suppressed duplicate ingestion",
        description: "Duplicate capture was filtered to keep surfaces clean.",
        confidenceScore: input.confidence,
        metadata: {
          importSourceId: input.importSourceId
        }
      });
    }

    if (!input.obligationId) {
      return null;
    }

    const obligation = await this.repository.findObligationByIdForUser(input.userId, input.obligationId);
    if (!obligation) return null;

    const recentCorrection = obligation.vendor
      ? await this.repository.hasRecentCorrectionForVendor({
          userId: input.userId,
          vendor: obligation.vendor,
          days: 30
        })
      : false;

    const isFinancial = this.isFinancialObligation({
      type: obligation.type,
      amount: obligation.amount ? Number(obligation.amount) : null
    });

    const guardrail = this.guardrails.evaluate({
      policy: policyPayload,
      action: ZeroInputActionType.CREATE_DRAFT_FROM_INGESTION,
      actionAllowed: true,
      confidenceScore: input.confidence,
      isFinancial,
      isDuplicate: input.duplicateCandidate,
      hasConflict: input.conflictDetected || input.needsReview,
      recentCorrection
    });

    const existingOpenApproval = await this.repository.findOpenDecisionByReference({
      userId: input.userId,
      candidateAction: ZeroInputActionType.CREATE_DRAFT_FROM_INGESTION,
      referenceType: "obligation",
      referenceId: obligation.id
    });
    if (existingOpenApproval) {
      return this.toDecisionPayload(existingOpenApproval);
    }

    if (guardrail.outcome === "APPROVAL_REQUIRED" && obligation.status === ObligationStatus.ACTIVE) {
      await this.repository.updateObligationForUser({
        userId: input.userId,
        obligationId: obligation.id,
        data: {
          status: ObligationStatus.DRAFT
        }
      });
    }

    const persisted = await this.persistDecision({
      userId: input.userId,
      action: ZeroInputActionType.CREATE_DRAFT_FROM_INGESTION,
      guardrail,
      sourceType: `ingestion:${input.channel.toLowerCase()}`,
      referenceType: "obligation",
      referenceId: obligation.id,
      obligationId: obligation.id,
      title:
        guardrail.outcome === "APPROVAL_REQUIRED"
          ? "Approval needed for ingested item"
          : guardrail.outcome === "EXECUTE"
            ? "Ingestion handled automatically"
            : "Ingestion routed to review",
      description: obligation.title,
      confidenceScore: input.confidence,
      metadata: {
        importSourceId: input.importSourceId,
        ingestionStatus: input.status
      }
    });

    if (guardrail.outcome === "EXECUTE") {
      await this.executeFollowUpActions({
        userId: input.userId,
        obligationId: obligation.id,
        policy: policyPayload,
        confidenceScore: input.confidence,
        title: obligation.title,
        dueDate: obligation.dueDate
      });
    }

    return persisted;
  }

  async evaluateRecurringPredictions(userId: string) {
    const policy = await this.policyService.ensurePolicy(userId);
    const policyPayload = {
      ...policy,
      createdAt: policy.createdAt.toISOString(),
      updatedAt: policy.updatedAt.toISOString()
    };

    if (!policy.modeEnabled || !policy.allowPredictionPromotion || !policy.allowRecurringPromotion) {
      return {
        evaluated: 0,
        createdDecisions: 0
      };
    }

    const predictions = await this.repository.listActiveRecurringPredictions(userId, 50);
    let createdDecisions = 0;

    for (const prediction of predictions) {
      const recent = await this.repository.findRecentDecisionByReference({
        userId,
        candidateAction: ZeroInputActionType.PROMOTE_RECURRING_PREDICTION,
        referenceType: "prediction",
        referenceId: prediction.id,
        since: new Date(Date.now() - 24 * 60 * 60 * 1000)
      });
      if (recent) continue;

      const pending = await this.repository.findOpenDecisionByReference({
        userId,
        candidateAction: ZeroInputActionType.PROMOTE_RECURRING_PREDICTION,
        referenceType: "prediction",
        referenceId: prediction.id
      });
      if (pending) continue;

      const rationale = asRecord(prediction.rationale);
      const vendor = asString(rationale?.matchedVendor) ?? asString(rationale?.vendor);
      const amount = asNumber(rationale?.amount);
      const confidenceScore = Number(prediction.confidenceScore);
      const dueDate = prediction.predictedDate;

      const duplicate = await this.repository.findSimilarOpenObligation({
        userId,
        vendor,
        title: prediction.title,
        dueDate
      });

      const recentCorrection = vendor
        ? await this.repository.hasRecentCorrectionForVendor({
            userId,
            vendor,
            days: 45
          })
        : false;

      const guardrail = this.guardrails.evaluate({
        policy: policyPayload,
        action: ZeroInputActionType.PROMOTE_RECURRING_PREDICTION,
        actionAllowed: policy.allowPredictionPromotion && policy.allowRecurringPromotion,
        confidenceScore,
        isFinancial: this.isFinancialObligation({
          type: asString(rationale?.obligationType) ?? null,
          amount
        }),
        isDuplicate: Boolean(duplicate),
        hasConflict: false,
        recentCorrection
      });

      const decision = await this.persistDecision({
        userId,
        action: ZeroInputActionType.PROMOTE_RECURRING_PREDICTION,
        guardrail,
        sourceType: "prediction_engine",
        referenceType: "prediction",
        referenceId: prediction.id,
        predictionId: prediction.id,
        obligationId: duplicate?.id ?? null,
        title:
          guardrail.outcome === "APPROVAL_REQUIRED"
            ? "Approval needed for recurring prediction"
            : guardrail.outcome === "EXECUTE"
              ? "Recurring prediction promoted"
              : guardrail.outcome === "SUPPRESS"
                ? "Recurring prediction suppressed"
                : "Recurring prediction routed to review",
        description: prediction.title,
        confidenceScore,
        metadata: {
          duplicateObligationId: duplicate?.id ?? null
        },
        rationale: {
          matchedVendor: vendor,
          predictedDate: prediction.predictedDate?.toISOString() ?? null,
          predictionType: prediction.predictionType
        }
      });

      if (decision) createdDecisions += 1;

      if (guardrail.outcome === "EXECUTE") {
        const execution = await this.executor.execute({
          userId,
          action: ZeroInputActionType.PROMOTE_RECURRING_PREDICTION,
          predictionId: prediction.id,
          policy: policyPayload,
          reason: "recurring_prediction_guardrail_passed"
        });

        if (execution.executed && decision) {
          const updated = await this.repository.updateDecision(decision.id, {
            obligationId:
              "obligationId" in execution && execution.obligationId
                ? execution.obligationId
                : decision.obligationId,
            executedAt: new Date()
          });

          await this.repository.createAuditEvent({
            userId,
            obligationId: updated.obligationId,
            eventType: "zero_input_prediction_promoted",
            metadata: {
              decisionId: updated.id,
              predictionId: prediction.id
            }
          });

          if (policy.allowReminderAutocreate && execution.obligationId) {
            await this.createReminderDecision({
              userId,
              policy: policyPayload,
              obligationId: execution.obligationId,
              title: prediction.title,
              dueDate: prediction.predictedDate,
              sourceType: "prediction_engine",
              referenceType: "prediction",
              referenceId: prediction.id,
              confidenceScore
            });
          }
        }
      }
    }

    return {
      evaluated: predictions.length,
      createdDecisions
    };
  }

  private async executeFollowUpActions(input: {
    userId: string;
    obligationId: string;
    policy: Awaited<ReturnType<ZeroInputPolicyService["getPolicy"]>>;
    confidenceScore: number;
    title: string;
    dueDate: Date | null;
  }) {
    if (input.policy.allowAutoFlowPreparation) {
      const guardrail = this.guardrails.evaluate({
        policy: input.policy,
        action: ZeroInputActionType.PREPARE_AUTO_FLOW,
        actionAllowed: input.policy.allowAutoFlowPreparation,
        confidenceScore: input.confidenceScore,
        isFinancial: false,
        isDuplicate: false,
        hasConflict: false,
        recentCorrection: false,
        isPreparationAction: true
      });

      const decision = await this.persistDecision({
        userId: input.userId,
        action: ZeroInputActionType.PREPARE_AUTO_FLOW,
        guardrail,
        sourceType: "zero_input",
        referenceType: "obligation",
        referenceId: input.obligationId,
        obligationId: input.obligationId,
        title:
          guardrail.outcome === "EXECUTE"
            ? "Prepared ready-to-act flow"
            : "Flow preparation skipped",
        description: input.title,
        confidenceScore: input.confidenceScore
      });

      if (guardrail.outcome === "EXECUTE") {
        await this.executor.execute({
          userId: input.userId,
          action: ZeroInputActionType.PREPARE_AUTO_FLOW,
          obligationId: input.obligationId,
          policy: input.policy,
          reason: "auto_flow_preparation"
        });
      } else if (decision && guardrail.outcome === "APPROVAL_REQUIRED") {
        await this.repository.updateDecision(decision.id, {
          metadata: mergeJson(decision.metadata, {
            actionLabel: "Prepare ready flow"
          }) as Prisma.InputJsonValue
        });
      }
    }

    if (input.policy.allowReminderAutocreate) {
      await this.createReminderDecision({
        userId: input.userId,
        policy: input.policy,
        obligationId: input.obligationId,
        title: input.title,
        dueDate: input.dueDate,
        sourceType: "zero_input",
        referenceType: "obligation",
        referenceId: input.obligationId,
        confidenceScore: input.confidenceScore
      });
    }
  }

  private async createReminderDecision(input: {
    userId: string;
    policy: Awaited<ReturnType<ZeroInputPolicyService["getPolicy"]>>;
    obligationId: string;
    title: string;
    dueDate: Date | null;
    sourceType: string;
    referenceType: string;
    referenceId: string;
    confidenceScore: number;
  }) {
    const guardrail = this.guardrails.evaluate({
      policy: input.policy,
      action: ZeroInputActionType.AUTO_CREATE_REMINDER,
      actionAllowed: input.policy.allowReminderAutocreate,
      confidenceScore: input.confidenceScore,
      isFinancial: false,
      isDuplicate: false,
      hasConflict: false,
      recentCorrection: false,
      isPreparationAction: true
    });

    const decision = await this.persistDecision({
      userId: input.userId,
      action: ZeroInputActionType.AUTO_CREATE_REMINDER,
      guardrail,
      sourceType: input.sourceType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      obligationId: input.obligationId,
      title:
        guardrail.outcome === "EXECUTE"
          ? "Reminder created automatically"
          : "Reminder creation queued for approval",
      description: input.title,
      confidenceScore: input.confidenceScore,
      metadata: {
        dueDate: input.dueDate?.toISOString() ?? null
      }
    });

    if (!decision || guardrail.outcome !== "EXECUTE") return decision;

    const execution = await this.executor.execute({
      userId: input.userId,
      action: ZeroInputActionType.AUTO_CREATE_REMINDER,
      obligationId: input.obligationId,
      title: input.title,
      dueDate: input.dueDate,
      policy: input.policy,
      reason: "reminder_auto_create"
    });

    if ("reminderId" in execution && execution.reminderId) {
      await this.repository.updateDecision(decision.id, {
        reminderId: execution.reminderId,
        executedAt: new Date()
      });
    }

    return decision;
  }

  private async persistDecision(input: {
    userId: string;
    action: ZeroInputActionType;
    guardrail: ReturnType<ZeroInputGuardrails["evaluate"]>;
    sourceType: string;
    referenceType: string;
    referenceId: string | null;
    title: string;
    description?: string | null;
    confidenceScore: number;
    obligationId?: string | null;
    predictionId?: string | null;
    metadata?: Prisma.InputJsonValue;
    rationale?: Prisma.InputJsonValue;
  }) {
    const decision =
      input.guardrail.outcome === "EXECUTE"
        ? ZeroInputDecision.EXECUTED
        : input.guardrail.outcome === "APPROVAL_REQUIRED"
          ? ZeroInputDecision.APPROVAL_REQUIRED
          : input.guardrail.outcome === "REVIEW"
            ? ZeroInputDecision.REVIEW
            : ZeroInputDecision.SUPPRESSED;

    const approvalStatus =
      decision === ZeroInputDecision.APPROVAL_REQUIRED
        ? ZeroInputApprovalStatus.PENDING
        : ZeroInputApprovalStatus.NONE;

    const rationaleRecord = asRecord(input.rationale) ?? {};

    const created = await this.repository.createDecision({
      userId: input.userId,
      sourceType: input.sourceType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      obligationId: input.obligationId ?? null,
      predictionId: input.predictionId ?? null,
      candidateAction: input.action,
      decision,
      approvalStatus,
      title: input.title,
      description: input.description ?? null,
      confidenceScore: input.confidenceScore,
      rationale: {
        reasons: input.guardrail.reasons,
        ...rationaleRecord
      },
      guardrailResults: input.guardrail.results,
      metadata: input.metadata as Prisma.InputJsonValue,
      executedAt: decision === ZeroInputDecision.EXECUTED ? new Date() : null
    });

    await this.repository.createAuditEvent({
      userId: input.userId,
      obligationId: created.obligationId,
      eventType: "zero_input_decision_recorded",
      metadata: {
        decisionId: created.id,
        candidateAction: created.candidateAction,
        decision: created.decision,
        approvalStatus: created.approvalStatus
      }
    });

    return this.toDecisionPayload(created);
  }

  private toDecisionPayload(item: AutonomyDecisionWithRelations): DecisionPayload {
    const confidenceScore = Number(item.confidenceScore);
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      sourceType: item.sourceType,
      referenceType: item.referenceType,
      referenceId: item.referenceId,
      candidateAction: item.candidateAction,
      decision: item.decision,
      approvalStatus: item.approvalStatus,
      confidenceScore,
      confidenceBand: toConfidenceBand(confidenceScore),
      rationale: asRecord(item.rationale),
      guardrailResults: asRecord(item.guardrailResults),
      metadata: asRecord(item.metadata),
      obligationId: item.obligationId,
      predictionId: item.predictionId,
      reminderId: item.reminderId,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      executedAt: item.executedAt?.toISOString() ?? null,
      approvedAt: item.approvedAt?.toISOString() ?? null,
      rejectedAt: item.rejectedAt?.toISOString() ?? null,
      undoneAt: item.undoneAt?.toISOString() ?? null,
      undoReason: item.undoReason,
      canApprove:
        item.decision === ZeroInputDecision.APPROVAL_REQUIRED &&
        item.approvalStatus === ZeroInputApprovalStatus.PENDING,
      canReject:
        item.decision === ZeroInputDecision.APPROVAL_REQUIRED &&
        item.approvalStatus === ZeroInputApprovalStatus.PENDING,
      canUndo:
        item.decision === ZeroInputDecision.EXECUTED &&
        item.approvalStatus !== ZeroInputApprovalStatus.UNDONE &&
        canUndoAction(item.candidateAction),
      obligation: item.obligation ? mapObligation(item.obligation) : null,
      prediction: item.prediction
        ? {
            id: item.prediction.id,
            title: item.prediction.title,
            description: item.prediction.description,
            predictionType: item.prediction.predictionType,
            predictedDate: item.prediction.predictedDate?.toISOString() ?? null,
            confidenceScore: Number(item.prediction.confidenceScore),
            confidenceBand: item.prediction.confidenceBand,
            status: item.prediction.status,
            promotedObligationId: item.prediction.promotedObligationId
          }
        : null,
      reminder: item.reminder
        ? {
            id: item.reminder.id,
            title: item.reminder.title,
            scheduledFor: item.reminder.scheduledFor.toISOString(),
            status: item.reminder.status
          }
        : null
    };
  }

  private isFinancialObligation(input: { type: string | null; amount: number | null }) {
    if ((input.amount ?? 0) > 0) return true;
    if (input.type === "BILL" || input.type === "SUBSCRIPTION" || input.type === "RENEWAL") {
      return true;
    }
    return false;
  }

  private resolveReminderTitle(decision: AutonomyDecisionWithRelations) {
    const metadata = asRecord(decision.metadata);
    const title = asString(metadata?.title);
    if (title) return title;
    if (decision.obligation) return decision.obligation.title;
    if (decision.prediction) return decision.prediction.title;
    return decision.title;
  }

  private resolveDueDate(decision: AutonomyDecisionWithRelations) {
    const metadata = asRecord(decision.metadata);
    const dueDate = asString(metadata?.dueDate);
    if (dueDate) return toDateOrNull(dueDate);
    if (decision.obligation?.dueDate) return decision.obligation.dueDate;
    if (decision.prediction?.predictedDate) return decision.prediction.predictedDate;
    return null;
  }

  private resolveScheduledFor(decision: AutonomyDecisionWithRelations) {
    const metadata = asRecord(decision.metadata);
    const scheduledFor = asString(metadata?.scheduledFor);
    return toDateOrNull(scheduledFor);
  }
}

function canUndoAction(action: ZeroInputActionType) {
  return (
    action === ZeroInputActionType.AUTO_CREATE_REMINDER ||
    action === ZeroInputActionType.CREATE_DRAFT_FROM_INGESTION ||
    action === ZeroInputActionType.PROMOTE_RECURRING_PREDICTION
  );
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toDateOrNull(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function mergeJson(existing: unknown, next: Record<string, unknown>) {
  const base = asRecord(existing) ?? {};
  return {
    ...base,
    ...next
  } as Prisma.InputJsonObject;
}
