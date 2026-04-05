import {
  ImportSourceSubtype,
  AutoFlowTriggerType,
  ImportParseStatus,
  Obligation,
  ObligationStatus,
  ObligationType,
  Prisma
} from "@prisma/client";
import { z } from "zod";
import { AppError } from "../utils/app-error";
import { mapObligation } from "../utils/obligation.mapper";
import {
  sourceLabelFromType,
  sourceTypeFromObligation,
  toConfidenceBand
} from "../utils/trust-layer";
import {
  CreateObligationFromIngestionInput,
  IngestionRepository
} from "../repositories/ingestion.repository";
import {
  classifyObligationType,
  type ClassificationResult,
  type SupportedObligationType
} from "./ingestion.classifier";
import {
  evaluateIngestionConfidence,
  type ConfidenceBand,
  type ConfidenceEvaluation
} from "./ingestion.confidence";
import { extractStructuredFields, type ExtractedFields } from "./ingestion.extractor";
import {
  normalizeCommandCaptureInput,
  normalizeEmailForwardInput,
  normalizeGmailReadonlyInput,
  normalizeUploadInput,
  type NormalizedIngestionInput
} from "./ingestion-normalizers";
import type { GmailSubscriptionHeuristicResult } from "./gmail-subscription-heuristics";
import { AutoFlowService } from "./auto-flow.service";
import { HomeMemoryService } from "./home-memory.service";
import { PredictionEngineService } from "./prediction-engine.service";
import { ZeroInputService } from "./zero-input.service";

const PARSER_VERSION = "ingestion-v1-rule-2026-04-04";

const emailForwardSchema = z.object({
  userId: z.string().min(1),
  subject: z.string().min(1),
  from: z.string().min(1),
  bodyText: z.string().min(1)
});

const uploadIngestionSchema = z.object({
  userId: z.string().min(1),
  uploadId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().int().nonnegative(),
  storagePath: z.string().min(1),
  extractedText: z.string().optional().nullable()
});

const gmailReadonlySchema = z.object({
  userId: z.string().min(1),
  externalConnectionId: z.string().min(1),
  gmailMessageId: z.string().min(1),
  gmailThreadId: z.string().nullable().optional(),
  matchedQueryKey: z.string().min(1),
  historyId: z.string().nullable().optional(),
  from: z.string().min(1),
  subject: z.string().min(1),
  bodyText: z.string().optional().default(""),
  snippet: z.string().nullable().optional(),
  labelIds: z.array(z.string()).optional(),
  messageDate: z.string().nullable().optional(),
  internalDate: z.string().nullable().optional(),
  subscriptionLifecycle: z.record(z.string(), z.unknown()).nullable().optional()
});

const commandCaptureSchema = z.object({
  userId: z.string().min(1),
  input: z.string().min(1),
  context: z
    .object({
      obligationId: z.string().optional()
    })
    .optional()
});

const confirmCandidateSchema = z.object({
  type: z.enum(["BILL", "SUBSCRIPTION", "RENEWAL", "COMMITMENT"]).optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  dueDate: z.string().nullable().optional(),
  recurrence: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE"]).optional()
});

const rejectCandidateSchema = z.object({
  reason: z.string().optional()
});

export type IngestionResult = {
  importSourceId: string;
  candidateId: string | null;
  obligationId: string | null;
  status: "ACTIVE" | "DRAFT" | "NO_CANDIDATE" | "DUPLICATE";
  parseStatus: ImportParseStatus;
  confidence: number;
  confidenceBand: ConfidenceBand;
  needsConfirmation: boolean;
  needsReview: boolean;
  isDuplicate: boolean;
  duplicateCandidate: boolean;
  conflictDetected: boolean;
  duplicateOfObligationId: string | null;
  conflictWithObligationId: string | null;
  extracted: {
    type: SupportedObligationType;
    title: string | null;
    vendor: string | null;
    amount: number | null;
    currency: string | null;
    dueDate: string | null;
    recurrence: string | null;
    description: string | null;
  };
};

export class IngestionService {
  private readonly repository = new IngestionRepository();
  private readonly autoFlowService = new AutoFlowService();
  private readonly homeMemoryService = new HomeMemoryService();
  private readonly predictionEngineService = new PredictionEngineService();
  private readonly zeroInputService = new ZeroInputService();

  async ingestEmailForward(payload: unknown): Promise<IngestionResult> {
    const input = emailForwardSchema.parse(payload);
    const normalized = normalizeEmailForwardInput(input);

    return this.ingestNormalized(normalized, {
      hasUsableText: Boolean(input.bodyText.trim())
    });
  }

  async ingestUpload(payload: unknown): Promise<IngestionResult> {
    const input = uploadIngestionSchema.parse(payload);
    const normalized = normalizeUploadInput(input);

    return this.ingestNormalized(normalized, {
      hasUsableText: Boolean((input.extractedText ?? "").trim()),
      uploadId: input.uploadId
    });
  }

  async ingestGmailReadonly(payload: unknown): Promise<IngestionResult> {
    const input = gmailReadonlySchema.parse(payload);
    const normalized = normalizeGmailReadonlyInput(input);

    return this.ingestNormalized(normalized, {
      hasUsableText: Boolean(input.bodyText.trim() || (input.snippet ?? "").trim())
    });
  }

  async ingestCommandCapture(payload: unknown): Promise<IngestionResult> {
    const input = commandCaptureSchema.parse(payload);
    const normalized = normalizeCommandCaptureInput(input);

    return this.ingestNormalized(normalized, {
      hasUsableText: Boolean(input.input.trim())
    });
  }

  async getObligationSource(userId: string, obligationId: string) {
    const obligation = await this.repository.findObligationByIdForUser(obligationId, userId);
    if (!obligation) return null;

    const source = obligation.importSource;
    const trustSourceType = sourceTypeFromObligation({
      source: obligation.source,
      subtype: source?.subtype
    });
    if (!source) {
      return {
        obligationId: obligation.id,
        sourceType: trustSourceType,
        sourceSubtype: null,
        parseStatus: null,
        parseConfidence: null,
        parserVersion: null,
        importedAt: null,
        extractionSummary: null,
        provenanceLabel: sourceLabelFromType(trustSourceType),
        rawData: null
      };
    }

    return {
      obligationId: obligation.id,
      sourceType: trustSourceType,
      sourceSubtype: source.subtype,
      parseStatus: source.parseStatus,
      parseConfidence: Number(source.parseConfidence),
      parserVersion: source.parserVersion,
      importedAt: source.createdAt.toISOString(),
      extractionSummary: source.extractionSummary,
      provenanceLabel:
        source.subtype === ImportSourceSubtype.GMAIL_READONLY
          ? "Imported from Gmail"
          : sourceLabelFromType(trustSourceType),
      rawData: source.rawData
    };
  }

  async confirmCandidate(userId: string, obligationId: string, payload: unknown) {
    const input = confirmCandidateSchema.parse(payload ?? {});
    const obligation = await this.repository.findObligationByIdForUser(obligationId, userId);
    if (!obligation) {
      return null;
    }

    const dueDate = toOptionalDate(input.dueDate);

    const updated = await this.repository.updateObligationForUser({
      obligationId,
      userId,
      data: {
        type: input.type,
        title: input.title,
        description: input.description,
        vendor: input.vendor,
        amount: input.amount,
        currency: input.currency?.toUpperCase() ?? input.currency,
        dueDate,
        recurrence: input.recurrence,
        status: input.status ?? ObligationStatus.ACTIVE,
        confidenceScore: calculateConfirmedConfidence(obligation.confidenceScore)
      }
    });

    if (!updated) return null;

    if (updated.importSourceId) {
      await this.repository.updateImportSourceParseResult({
        importSourceId: updated.importSourceId,
        parseStatus: ImportParseStatus.READY,
        parseConfidence: Number(updated.confidenceScore),
        extractionSummary: {
          action: "confirmed",
          confirmedAt: new Date().toISOString()
        }
      });
    }

    await this.repository.createAuditEvent({
      userId,
      obligationId,
      eventType: "ingestion_candidate_confirmed",
      metadata: {
        status: updated.status,
        confidenceScore: Number(updated.confidenceScore)
      }
    });

    if (updated.importSource?.subtype === ImportSourceSubtype.GMAIL_READONLY) {
      await this.repository.createAuditEvent({
        userId,
        obligationId,
        eventType: "gmail_candidate_reviewed",
        metadata: {
          status: updated.status,
          confidenceScore: Number(updated.confidenceScore),
          action: "confirmed"
        }
      });

      const lifecycle = getGmailSubscriptionLifecycleMetadata(
        asRecord(updated.importSource.rawData) ?? {}
      );
      if (lifecycle && lifecycle.lifecycleEmailType !== "UNKNOWN") {
        await this.repository.createAuditEvent({
          userId,
          obligationId,
          eventType: "gmail_subscription_review_confirmed",
          metadata: {
            lifecycleEmailType: lifecycle.lifecycleEmailType,
            confidenceBand: lifecycle.confidence.confidenceBand
          }
        });
      }

      if (updated.subscriptionId) {
        await this.repository.createAuditEvent({
          userId,
          obligationId,
          eventType: "subscription_registry_review_confirmed",
          metadata: {
            subscriptionId: updated.subscriptionId,
            confidenceScore: Number(updated.confidenceScore)
          }
        });
      }
    }

    await this.captureMemorySignal({
      userId,
      sourceType: "INGESTION",
      referenceId: obligationId,
      eventType: "ingestion_candidate_confirmed",
      metadata: {
        status: updated.status,
        confidenceScore: Number(updated.confidenceScore)
      }
    });

    await this.predictionEngineService
      .resolveWithObligation({
        userId,
        obligationId,
        obligationType: updated.type,
        vendor: updated.vendor,
        dueDate: updated.dueDate
      })
      .catch(() => null);

    return mapObligation(updated as Obligation);
  }

  async rejectCandidate(userId: string, obligationId: string, payload: unknown) {
    const input = rejectCandidateSchema.parse(payload ?? {});
    const obligation = await this.repository.findObligationByIdForUser(obligationId, userId);
    if (!obligation) {
      return null;
    }

    const updated = await this.repository.updateObligationForUser({
      obligationId,
      userId,
      data: {
        status: ObligationStatus.IGNORED,
        lastActedAt: new Date()
      }
    });

    if (!updated) return null;

    if (updated.importSourceId) {
      await this.repository.updateImportSourceParseResult({
        importSourceId: updated.importSourceId,
        parseStatus: ImportParseStatus.REJECTED,
        parseConfidence: Number(updated.confidenceScore),
        extractionSummary: {
          action: "rejected",
          reason: input.reason ?? null,
          rejectedAt: new Date().toISOString()
        }
      });
    }

    await this.repository.createAuditEvent({
      userId,
      obligationId,
      eventType: "ingestion_candidate_rejected",
      metadata: {
        reason: input.reason ?? null
      }
    });

    if (updated.importSource?.subtype === ImportSourceSubtype.GMAIL_READONLY) {
      await this.repository.createAuditEvent({
        userId,
        obligationId,
        eventType: "gmail_candidate_rejected",
        metadata: {
          reason: input.reason ?? null
        }
      });

      const lifecycle = getGmailSubscriptionLifecycleMetadata(
        asRecord(updated.importSource.rawData) ?? {}
      );
      if (lifecycle && lifecycle.lifecycleEmailType !== "UNKNOWN") {
        await this.repository.createAuditEvent({
          userId,
          obligationId,
          eventType: "gmail_subscription_review_rejected",
          metadata: {
            lifecycleEmailType: lifecycle.lifecycleEmailType,
            reason: input.reason ?? null
          }
        });
      }

      if (updated.subscriptionId) {
        await this.repository.createAuditEvent({
          userId,
          obligationId,
          eventType: "subscription_registry_review_rejected",
          metadata: {
            subscriptionId: updated.subscriptionId,
            reason: input.reason ?? null
          }
        });
      }
    }

    await this.captureMemorySignal({
      userId,
      sourceType: "INGESTION",
      referenceId: obligationId,
      eventType: "ingestion_candidate_rejected",
      metadata: {
        reason: input.reason ?? null
      }
    });

    return mapObligation(updated as Obligation);
  }

  private async ingestNormalized(
    normalized: NormalizedIngestionInput,
    options: {
      hasUsableText: boolean;
      uploadId?: string;
    }
  ): Promise<IngestionResult> {
    const duplicate = await this.repository.findMostRecentByContentHash({
      userId: normalized.userId,
      subtype: normalized.importSubtype,
      contentHash: normalized.contentHash
    });

    const importSource = await this.repository.createImportSource({
      userId: normalized.userId,
      type: normalized.importType,
      subtype: normalized.importSubtype,
      rawData: normalized.metadata as Prisma.InputJsonObject,
      rawText: normalized.rawText,
      normalizedText: normalized.normalizedText,
      contentHash: normalized.contentHash,
      parserVersion: PARSER_VERSION,
      uploadId: options.uploadId
    });

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      eventType: "ingestion_input_received",
      metadata: {
        importSourceId: importSource.id,
        subtype: normalized.importSubtype,
        contentHash: normalized.contentHash
      }
    });

    await this.captureMemorySignal({
      userId: normalized.userId,
      sourceType: "INGESTION",
      referenceId: importSource.id,
      eventType: "ingestion_input_received",
      metadata: {
        channel: normalized.channel,
        subtype: normalized.importSubtype
      }
    });

    if (duplicate?.obligations[0]) {
      const existing = duplicate.obligations[0];

      await this.repository.updateImportSourceParseResult({
        importSourceId: importSource.id,
        parseStatus: ImportParseStatus.REJECTED,
        parseConfidence: 0.99,
        extractionSummary: {
          duplicateOfImportSourceId: duplicate.id,
          duplicateOfObligationId: existing.id
        }
      });

      await this.repository.createAuditEvent({
        userId: normalized.userId,
        obligationId: existing.id,
        eventType: "ingestion_duplicate_detected",
        metadata: {
          importSourceId: importSource.id,
          duplicateOfImportSourceId: duplicate.id
        }
      });

      await this.captureMemorySignal({
        userId: normalized.userId,
        sourceType: "INGESTION",
        referenceId: existing.id,
        eventType: "ingestion_duplicate_detected",
        metadata: {
          importSourceId: importSource.id,
          duplicateOfObligationId: existing.id
        }
      });

      const duplicateResult: IngestionResult = {
        importSourceId: importSource.id,
        candidateId: existing.id,
        obligationId: existing.id,
        status: "DUPLICATE",
        parseStatus: ImportParseStatus.REJECTED,
        confidence: Number(existing.confidenceScore),
        confidenceBand: toConfidenceBand(Number(existing.confidenceScore)),
        needsConfirmation: existing.status !== ObligationStatus.ACTIVE,
        needsReview: existing.status !== ObligationStatus.ACTIVE,
        isDuplicate: true,
        duplicateCandidate: true,
        conflictDetected: false,
        duplicateOfObligationId: existing.id,
        conflictWithObligationId: null,
        extracted: {
          type: existing.type,
          title: existing.title,
          vendor: existing.vendor,
          amount: decimalToNumber(existing.amount),
          currency: existing.currency,
          dueDate: existing.dueDate?.toISOString() ?? null,
          recurrence: existing.recurrence,
          description: existing.description
        }
      };

      await this.zeroInputService
        .evaluateIngestionResult({
          userId: normalized.userId,
          channel: normalized.channel,
          importSourceId: importSource.id,
          obligationId: duplicateResult.obligationId,
          status: duplicateResult.status,
          confidence: duplicateResult.confidence,
          duplicateCandidate: true,
          conflictDetected: false,
          needsReview: duplicateResult.needsReview,
          extracted: {
            type: duplicateResult.extracted.type,
            title: duplicateResult.extracted.title,
            vendor: duplicateResult.extracted.vendor,
            amount: duplicateResult.extracted.amount,
            dueDate: duplicateResult.extracted.dueDate
          }
        })
        .catch(() => null);

      return duplicateResult;
    }

    const gmailSubscriptionLifecycle = getGmailSubscriptionLifecycleMetadata(normalized.metadata);

    const baseClassification = classifyObligationType(
      normalized.normalizedText,
      normalized.titleHint
    );
    const classification = applyGmailLifecycleClassificationHint(
      baseClassification,
      gmailSubscriptionLifecycle
    );

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      eventType: "ingestion_classified",
      metadata: {
        importSourceId: importSource.id,
        type: classification.type,
        confidence: classification.confidence,
        scores: classification.scores,
        matchedIndicators: classification.matchedIndicators,
        gmailLifecycleEmailType: gmailSubscriptionLifecycle?.lifecycleEmailType ?? null,
        gmailLifecycleConfidence: gmailSubscriptionLifecycle?.confidence.confidenceScore ?? null
      }
    });

    const baseExtracted = extractStructuredFields({
      channel: normalized.channel,
      classificationType: classification.type,
      rawText: normalized.rawText,
      normalizedText: normalized.normalizedText,
      titleHint: normalized.titleHint,
      metadata: normalized.metadata,
      now: new Date()
    });
    const extracted = applyGmailLifecycleExtractionHint(baseExtracted, gmailSubscriptionLifecycle);

    const baseConfidence = evaluateIngestionConfidence({
      channel: normalized.channel,
      classification,
      extracted,
      hasUsableText: options.hasUsableText
    });
    const confidence = applyGmailLifecycleConfidenceHint(baseConfidence, gmailSubscriptionLifecycle);

    const existingLifecycleMatch =
      normalized.channel === "EMAIL_GMAIL" && gmailSubscriptionLifecycle
        ? await this.findLifecycleExistingMatch(normalized.userId, gmailSubscriptionLifecycle)
        : null;

    if (
      existingLifecycleMatch &&
      gmailSubscriptionLifecycle &&
      shouldSuppressForLifecycleMatch(gmailSubscriptionLifecycle, confidence)
    ) {
      const lifecycle = gmailSubscriptionLifecycle;
      const lifecycleUpdateData = buildLifecycleObligationUpdate({
        existing: existingLifecycleMatch,
        lifecycle
      });

      const updatedExisting =
        lifecycleUpdateData && Object.keys(lifecycleUpdateData).length > 0
          ? await this.repository.updateObligationForUser({
              obligationId: existingLifecycleMatch.id,
              userId: normalized.userId,
              data: lifecycleUpdateData
            })
          : existingLifecycleMatch;

      const lifecycleConflict = detectLifecycleConflict(
        lifecycle,
        updatedExisting ?? existingLifecycleMatch
      );

      const lifecycleConfidence = Math.max(
        confidence.score,
        lifecycle.confidence.confidenceScore
      );

      await this.repository.updateImportSourceParseResult({
        importSourceId: importSource.id,
        parseStatus: lifecycleConflict
          ? ImportParseStatus.NEEDS_CONFIRMATION
          : ImportParseStatus.REJECTED,
        parseConfidence: lifecycleConfidence,
        extractionSummary: {
          classification,
          extracted,
          confidence: {
            score: lifecycleConfidence,
            band: toConfidenceBand(lifecycleConfidence),
            rationale: confidence.rationale
          },
          gmailSubscriptionLifecycle: summarizeGmailLifecycle(lifecycle),
          validation: {
            duplicateCandidate: true,
            conflictDetected: lifecycleConflict,
            duplicateOfObligationId: existingLifecycleMatch.id,
            conflictWithObligationId: lifecycleConflict ? existingLifecycleMatch.id : null,
            reason: "matched_existing_subscription_lifecycle"
          }
        }
      });

      await this.repository.createAuditEvent({
        userId: normalized.userId,
        obligationId: existingLifecycleMatch.id,
        eventType: "gmail_subscription_matched_existing",
        metadata: {
          importSourceId: importSource.id,
          lifecycleEmailType: lifecycle.lifecycleEmailType,
          lifecycleConfidence: lifecycle.confidence.confidenceScore,
          vendor: lifecycle.extraction.vendor,
          planName: lifecycle.extraction.planName
        }
      });

      if (lifecycleConflict) {
        await this.repository.createAuditEvent({
          userId: normalized.userId,
          obligationId: existingLifecycleMatch.id,
          eventType: "gmail_subscription_conflict_detected",
          metadata: {
            importSourceId: importSource.id,
            lifecycleEmailType: lifecycle.lifecycleEmailType,
            reason: "lifecycle_conflicts_with_existing_state"
          }
        });
      }

      if (lifecycle.lifecycleEmailType === "CANCELLATION") {
        await this.repository.createAuditEvent({
          userId: normalized.userId,
          obligationId: existingLifecycleMatch.id,
          eventType: "gmail_subscription_cancellation_detected",
          metadata: {
            importSourceId: importSource.id,
            effectiveDate: lifecycle.extraction.cancellationEffectiveDate ?? null,
            autoRenewStatus: lifecycle.extraction.autoRenewStatus
          }
        });
      }

      await this.captureMemorySignal({
        userId: normalized.userId,
        sourceType: "INGESTION",
        referenceId: existingLifecycleMatch.id,
        eventType: "gmail_subscription_matched_existing",
        metadata: {
          importSourceId: importSource.id,
          lifecycleEmailType: lifecycle.lifecycleEmailType
        }
      });

      await this.predictionEngineService
        .resolveWithObligation({
          userId: normalized.userId,
          obligationId: existingLifecycleMatch.id,
          obligationType: existingLifecycleMatch.type,
          vendor: existingLifecycleMatch.vendor,
          dueDate: existingLifecycleMatch.dueDate
        })
        .catch(() => null);

      const existingAmount = decimalToNumber(updatedExisting?.amount ?? existingLifecycleMatch.amount);
      const existingDueDate =
        (updatedExisting?.dueDate ?? existingLifecycleMatch.dueDate)?.toISOString() ?? null;

      const duplicateResult: IngestionResult = {
        importSourceId: importSource.id,
        candidateId: existingLifecycleMatch.id,
        obligationId: existingLifecycleMatch.id,
        status: "DUPLICATE",
        parseStatus: lifecycleConflict
          ? ImportParseStatus.NEEDS_CONFIRMATION
          : ImportParseStatus.REJECTED,
        confidence: lifecycleConfidence,
        confidenceBand: toConfidenceBand(lifecycleConfidence),
        needsConfirmation: lifecycleConflict,
        needsReview: lifecycleConflict || confidence.band !== "HIGH",
        isDuplicate: true,
        duplicateCandidate: true,
        conflictDetected: lifecycleConflict,
        duplicateOfObligationId: existingLifecycleMatch.id,
        conflictWithObligationId: lifecycleConflict ? existingLifecycleMatch.id : null,
        extracted: {
          type: existingLifecycleMatch.type,
          title: updatedExisting?.title ?? existingLifecycleMatch.title,
          vendor: updatedExisting?.vendor ?? existingLifecycleMatch.vendor,
          amount: existingAmount,
          currency: updatedExisting?.currency ?? existingLifecycleMatch.currency,
          dueDate: existingDueDate,
          recurrence: updatedExisting?.recurrence ?? existingLifecycleMatch.recurrence,
          description: updatedExisting?.description ?? existingLifecycleMatch.description
        }
      };

      await this.zeroInputService
        .evaluateIngestionResult({
          userId: normalized.userId,
          channel: normalized.channel,
          importSourceId: importSource.id,
          obligationId: duplicateResult.obligationId,
          status: duplicateResult.status,
          confidence: duplicateResult.confidence,
          duplicateCandidate: true,
          conflictDetected: lifecycleConflict,
          needsReview: duplicateResult.needsReview,
          extracted: {
            type: duplicateResult.extracted.type,
            title: duplicateResult.extracted.title,
            vendor: duplicateResult.extracted.vendor,
            amount: duplicateResult.extracted.amount,
            dueDate: duplicateResult.extracted.dueDate
          }
        })
        .catch(() => null);

      return duplicateResult;
    }

    const structuredDuplicate = await this.repository.findDuplicateByStructuredFields({
      userId: normalized.userId,
      vendor: extracted.vendor,
      amount: extracted.amount,
      dueDate: extracted.dueDate,
      type: extracted.type as ObligationType
    });

    if (structuredDuplicate) {
      await this.repository.updateImportSourceParseResult({
        importSourceId: importSource.id,
        parseStatus: ImportParseStatus.REJECTED,
        parseConfidence: Math.max(confidence.score, 0.9),
        extractionSummary: {
          classification,
          extracted,
          confidence: {
            score: confidence.score,
            band: confidence.band,
            rationale: confidence.rationale
          },
          gmailSubscriptionLifecycle: summarizeGmailLifecycle(gmailSubscriptionLifecycle),
          validation: {
            duplicateCandidate: true,
            conflictDetected: false,
            duplicateOfObligationId: structuredDuplicate.id,
            conflictWithObligationId: null,
            reason: "same_vendor_date_amount"
          }
        }
      });

      await this.repository.createAuditEvent({
        userId: normalized.userId,
        obligationId: structuredDuplicate.id,
        eventType: "ingestion_structured_duplicate_detected",
        metadata: {
          importSourceId: importSource.id,
          duplicateOfObligationId: structuredDuplicate.id
        }
      });

      await this.captureMemorySignal({
        userId: normalized.userId,
        sourceType: "INGESTION",
        referenceId: structuredDuplicate.id,
        eventType: "ingestion_structured_duplicate_detected",
        metadata: {
          importSourceId: importSource.id,
          duplicateOfObligationId: structuredDuplicate.id
        }
      });

      const duplicateResult: IngestionResult = {
        importSourceId: importSource.id,
        candidateId: structuredDuplicate.id,
        obligationId: structuredDuplicate.id,
        status: "DUPLICATE",
        parseStatus: ImportParseStatus.REJECTED,
        confidence: Number(structuredDuplicate.confidenceScore),
        confidenceBand: toConfidenceBand(Number(structuredDuplicate.confidenceScore)),
        needsConfirmation: structuredDuplicate.status !== ObligationStatus.ACTIVE,
        needsReview: true,
        isDuplicate: true,
        duplicateCandidate: true,
        conflictDetected: false,
        duplicateOfObligationId: structuredDuplicate.id,
        conflictWithObligationId: null,
        extracted: {
          type: structuredDuplicate.type,
          title: structuredDuplicate.title,
          vendor: structuredDuplicate.vendor,
          amount: decimalToNumber(structuredDuplicate.amount),
          currency: structuredDuplicate.currency,
          dueDate: structuredDuplicate.dueDate?.toISOString() ?? null,
          recurrence: structuredDuplicate.recurrence,
          description: structuredDuplicate.description
        }
      };

      await this.zeroInputService
        .evaluateIngestionResult({
          userId: normalized.userId,
          channel: normalized.channel,
          importSourceId: importSource.id,
          obligationId: duplicateResult.obligationId,
          status: duplicateResult.status,
          confidence: duplicateResult.confidence,
          duplicateCandidate: true,
          conflictDetected: false,
          needsReview: duplicateResult.needsReview,
          extracted: {
            type: duplicateResult.extracted.type,
            title: duplicateResult.extracted.title,
            vendor: duplicateResult.extracted.vendor,
            amount: duplicateResult.extracted.amount,
            dueDate: duplicateResult.extracted.dueDate
          }
        })
        .catch(() => null);

      return duplicateResult;
    }

    const conflictMatch = await this.repository.findConflictByStructuredFields({
      userId: normalized.userId,
      vendor: extracted.vendor,
      amount: extracted.amount,
      dueDate: extracted.dueDate,
      type: extracted.type as ObligationType
    });
    const conflictDetected = Boolean(conflictMatch);
    const guardedConfidence = applyValidationGuards(confidence, {
      conflictDetected
    });

    await this.repository.updateImportSourceParseResult({
      importSourceId: importSource.id,
      parseStatus: guardedConfidence.importParseStatus,
      parseConfidence: guardedConfidence.score,
      extractionSummary: {
        classification,
        extracted,
        confidence: {
          score: guardedConfidence.score,
          band: guardedConfidence.band,
          rationale: guardedConfidence.rationale
        },
        gmailSubscriptionLifecycle: summarizeGmailLifecycle(gmailSubscriptionLifecycle),
        validation: {
          duplicateCandidate: false,
          conflictDetected,
          duplicateOfObligationId: null,
          conflictWithObligationId: conflictMatch?.obligationId ?? null,
          conflictReason: conflictMatch?.reason ?? null
        }
      }
    });

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      eventType: "ingestion_extracted",
      metadata: {
        importSourceId: importSource.id,
        score: guardedConfidence.score,
        band: guardedConfidence.band,
        parseStatus: guardedConfidence.importParseStatus,
        conflictDetected,
        conflictWithObligationId: conflictMatch?.obligationId ?? null,
        gmailLifecycleEmailType: gmailSubscriptionLifecycle?.lifecycleEmailType ?? null
      }
    });

    if (conflictDetected && gmailSubscriptionLifecycle) {
      await this.repository.createAuditEvent({
        userId: normalized.userId,
        obligationId: conflictMatch?.obligationId ?? undefined,
        eventType: "gmail_subscription_conflict_detected",
        metadata: {
          importSourceId: importSource.id,
          lifecycleEmailType: gmailSubscriptionLifecycle.lifecycleEmailType,
          reason: conflictMatch?.reason ?? "conflicting_signal_detected"
        }
      });
    }

    if (!guardedConfidence.shouldCreateObligation || !guardedConfidence.obligationStatus) {
      const skippedReason = conflictDetected
        ? "conflict_detected"
        : gmailSubscriptionLifecycle?.confidence.shouldIgnore
          ? "gmail_lifecycle_low_signal"
          : "insufficient_confidence";

      await this.repository.createAuditEvent({
        userId: normalized.userId,
        eventType: "ingestion_candidate_skipped",
        metadata: {
          importSourceId: importSource.id,
          reason: skippedReason
        }
      });

      await this.captureMemorySignal({
        userId: normalized.userId,
        sourceType: "INGESTION",
        referenceId: importSource.id,
        eventType: "ingestion_candidate_skipped",
        metadata: {
          conflictDetected,
          reason: skippedReason
        }
      });

      const noCandidateResult: IngestionResult = {
        importSourceId: importSource.id,
        candidateId: null,
        obligationId: null,
        status: "NO_CANDIDATE",
        parseStatus: guardedConfidence.importParseStatus,
        confidence: guardedConfidence.score,
        confidenceBand: guardedConfidence.band,
        needsConfirmation: true,
        needsReview: true,
        isDuplicate: false,
        duplicateCandidate: false,
        conflictDetected,
        duplicateOfObligationId: null,
        conflictWithObligationId: conflictMatch?.obligationId ?? null,
        extracted: {
          type: extracted.type,
          title: extracted.title,
          vendor: extracted.vendor,
          amount: extracted.amount,
          currency: extracted.currency,
          dueDate: extracted.dueDate,
          recurrence: extracted.recurrence,
          description: extracted.description
        }
      };

      await this.zeroInputService
        .evaluateIngestionResult({
          userId: normalized.userId,
          channel: normalized.channel,
          importSourceId: importSource.id,
          obligationId: noCandidateResult.obligationId,
          status: noCandidateResult.status,
          confidence: noCandidateResult.confidence,
          duplicateCandidate: noCandidateResult.duplicateCandidate,
          conflictDetected: noCandidateResult.conflictDetected,
          needsReview: noCandidateResult.needsReview,
          extracted: {
            type: noCandidateResult.extracted.type,
            title: noCandidateResult.extracted.title,
            vendor: noCandidateResult.extracted.vendor,
            amount: noCandidateResult.extracted.amount,
            dueDate: noCandidateResult.extracted.dueDate
          }
        })
        .catch(() => null);

      return noCandidateResult;
    }

    const obligationInput = this.buildObligationPayload({
      userId: normalized.userId,
      importSourceId: importSource.id,
      extracted,
      sourceStatus: guardedConfidence.obligationStatus,
      score: guardedConfidence.score,
      source: normalized.obligationSource
    });

    const obligation = await this.repository.createObligationFromIngestion(obligationInput);

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      obligationId: obligation.id,
      eventType: "obligation_created",
      metadata: {
        title: obligation.title,
        type: obligation.type,
        via: "ingestion"
      }
    });

    const obligationStatus =
      obligation.status === ObligationStatus.ACTIVE ? "ACTIVE" : "DRAFT";

    await this.captureMemorySignal({
      userId: normalized.userId,
      sourceType: "INGESTION",
      referenceId: obligation.id,
      eventType: "ingestion_candidate_created",
      metadata: {
        importSourceId: importSource.id,
        obligationStatus,
        confidenceBand: guardedConfidence.band,
        needsConfirmation: guardedConfidence.needsConfirmation,
        gmailLifecycleEmailType: gmailSubscriptionLifecycle?.lifecycleEmailType ?? null
      }
    });

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      obligationId: obligation.id,
      eventType: "ingestion_candidate_created",
      metadata: {
        importSourceId: importSource.id,
        status: obligation.status,
        confidence: guardedConfidence.score,
        confidenceBand: guardedConfidence.band,
        conflictDetected,
        conflictWithObligationId: conflictMatch?.obligationId ?? null,
        gmailLifecycleEmailType: gmailSubscriptionLifecycle?.lifecycleEmailType ?? null
      }
    });

    await this.autoFlowService.triggerForEvent({
      userId: normalized.userId,
      obligationId: obligation.id,
      triggerType: AutoFlowTriggerType.INGESTION_TRIGGER,
      source: `ingestion:${normalized.channel.toLowerCase()}`,
      reasonHint:
        obligationStatus === "ACTIVE"
          ? "Ready now from new capture"
          : "New capture needs confirmation"
    });

    await this.predictionEngineService
      .resolveWithObligation({
        userId: normalized.userId,
        obligationId: obligation.id,
        obligationType: obligation.type,
        vendor: obligation.vendor,
        dueDate: obligation.dueDate
      })
      .catch(() => null);

    const successResult: IngestionResult = {
      importSourceId: importSource.id,
      candidateId: obligation.id,
      obligationId: obligation.id,
      status: obligationStatus,
      parseStatus: guardedConfidence.importParseStatus,
      confidence: guardedConfidence.score,
      confidenceBand: guardedConfidence.band,
      needsConfirmation: guardedConfidence.needsConfirmation,
      needsReview: guardedConfidence.needsConfirmation || conflictDetected,
      isDuplicate: false,
      duplicateCandidate: false,
      conflictDetected,
      duplicateOfObligationId: null,
      conflictWithObligationId: conflictMatch?.obligationId ?? null,
      extracted: {
        type: extracted.type,
        title: obligation.title,
        vendor: obligation.vendor,
        amount: decimalToNumber(obligation.amount),
        currency: obligation.currency,
        dueDate: obligation.dueDate?.toISOString() ?? null,
        recurrence: obligation.recurrence,
        description: obligation.description
      }
    };

    await this.zeroInputService
      .evaluateIngestionResult({
        userId: normalized.userId,
        channel: normalized.channel,
        importSourceId: importSource.id,
        obligationId: successResult.obligationId,
        status: successResult.status,
        confidence: successResult.confidence,
        duplicateCandidate: successResult.duplicateCandidate,
        conflictDetected: successResult.conflictDetected,
        needsReview: successResult.needsReview,
        extracted: {
          type: successResult.extracted.type,
          title: successResult.extracted.title,
          vendor: successResult.extracted.vendor,
          amount: successResult.extracted.amount,
          dueDate: successResult.extracted.dueDate
        }
      })
      .catch(() => null);

    return successResult;
  }

  private async captureMemorySignal(payload: {
    userId: string;
    sourceType: "INGESTION";
    referenceId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.homeMemoryService
      .captureSignal({
        ...payload,
        rebuild: true
      })
      .catch(() => null);
  }

  private async findLifecycleExistingMatch(
    userId: string,
    lifecycle: GmailSubscriptionHeuristicResult
  ) {
    const vendor = lifecycle.extraction.vendor?.trim();
    if (!vendor) return null;

    const candidates = await this.repository.findPotentialSubscriptionMatches({
      userId,
      vendor,
      limit: 25
    });

    if (candidates.length === 0) {
      return null;
    }

    let bestMatch: (typeof candidates)[number] | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = scoreLifecycleMatchCandidate(candidate, lifecycle);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    if (!bestMatch || bestScore < 0.58) {
      return null;
    }

    return bestMatch;
  }

  private buildObligationPayload(input: {
    userId: string;
    importSourceId: string;
    extracted: ReturnType<typeof extractStructuredFields>;
    sourceStatus: ObligationStatus;
    score: number;
    source: "MANUAL" | "EMAIL" | "DOCUMENT" | "INFERRED";
  }): CreateObligationFromIngestionInput {
    const title =
      input.extracted.title ?? `${toTitle(input.extracted.type.toLowerCase())} obligation`;

    const urgencyScore = computeUrgencyScore(input.extracted.dueDate, input.score);
    const importanceScore = computeImportanceScore(
      input.extracted.type,
      input.extracted.amount,
      input.score
    );

    return {
      userId: input.userId,
      importSourceId: input.importSourceId,
      type: input.extracted.type as ObligationType,
      title,
      description: input.extracted.description,
      vendor: input.extracted.vendor,
      amount: input.extracted.amount,
      currency: input.extracted.currency,
      dueDate: input.extracted.dueDate,
      recurrence: input.extracted.recurrence,
      source: input.source,
      confidenceScore: input.score,
      urgencyScore,
      importanceScore,
      effortLevel: computeEffortLevel(input.extracted.type),
      impactLevel: computeImpactLevel(input.extracted.amount, importanceScore),
      status: input.sourceStatus
    };
  }
}

function getGmailSubscriptionLifecycleMetadata(
  metadata: Record<string, unknown>
): GmailSubscriptionHeuristicResult | null {
  const raw = asRecord(metadata.subscriptionLifecycle);
  if (!raw) return null;

  const lifecycleEmailType = asString(raw.lifecycleEmailType);
  const classification = asRecord(raw.classification);
  const extraction = asRecord(raw.extraction);
  const confidence = asRecord(raw.confidence);

  if (!lifecycleEmailType || !classification || !extraction || !confidence) {
    return null;
  }

  if (
    lifecycleEmailType !== "WELCOME" &&
    lifecycleEmailType !== "RENEWAL" &&
    lifecycleEmailType !== "RECEIPT" &&
    lifecycleEmailType !== "CANCELLATION" &&
    lifecycleEmailType !== "UNKNOWN"
  ) {
    return null;
  }

  return raw as GmailSubscriptionHeuristicResult;
}

function applyGmailLifecycleClassificationHint(
  classification: ClassificationResult,
  lifecycle: GmailSubscriptionHeuristicResult | null
): ClassificationResult {
  if (!lifecycle || lifecycle.lifecycleEmailType === "UNKNOWN") {
    return classification;
  }

  const nextScores = {
    ...classification.scores
  };
  const nextIndicators = {
    ...classification.matchedIndicators,
    SUBSCRIPTION: [...classification.matchedIndicators.SUBSCRIPTION],
    RENEWAL: [...classification.matchedIndicators.RENEWAL],
    BILL: [...classification.matchedIndicators.BILL],
    COMMITMENT: [...classification.matchedIndicators.COMMITMENT]
  };

  let nextType = classification.type;
  if (lifecycle.lifecycleEmailType === "RENEWAL") {
    nextType = "RENEWAL";
    nextScores.RENEWAL += 0.85;
    nextIndicators.RENEWAL.push("gmail_lifecycle:renewal");
  } else if (
    lifecycle.lifecycleEmailType === "WELCOME" ||
    lifecycle.lifecycleEmailType === "RECEIPT" ||
    lifecycle.lifecycleEmailType === "CANCELLATION"
  ) {
    nextType = "SUBSCRIPTION";
    nextScores.SUBSCRIPTION += lifecycle.lifecycleEmailType === "RECEIPT" ? 0.8 : 0.72;
    nextIndicators.SUBSCRIPTION.push(
      `gmail_lifecycle:${lifecycle.lifecycleEmailType.toLowerCase()}`
    );
  }

  const nextConfidence = clamp(
    Math.max(classification.confidence, lifecycle.classification.classConfidence),
    0,
    1
  );

  return {
    type: nextType,
    confidence: nextConfidence,
    scores: nextScores,
    matchedIndicators: nextIndicators
  };
}

function applyGmailLifecycleExtractionHint(
  extracted: ExtractedFields,
  lifecycle: GmailSubscriptionHeuristicResult | null
): ExtractedFields {
  if (!lifecycle || lifecycle.lifecycleEmailType === "UNKNOWN") {
    return extracted;
  }

  const vendor = lifecycle.extraction.vendor ?? extracted.vendor;
  const amount =
    lifecycle.extraction.amountCharged ??
    lifecycle.extraction.recurringPrice ??
    lifecycle.extraction.introPrice ??
    extracted.amount;
  const currency = lifecycle.extraction.currency ?? extracted.currency;
  const dueDate =
    lifecycle.extraction.renewalDate ??
    lifecycle.extraction.cancellationEffectiveDate ??
    lifecycle.extraction.trialEndDate ??
    extracted.dueDate;
  const recurrence =
    mapLifecycleBillingPeriodToRecurrence(lifecycle.extraction.billingPeriod) ??
    extracted.recurrence;

  const title =
    lifecycle.extraction.subscriptionName ??
    lifecycle.extraction.planName ??
    extracted.title;
  const description = mergeDescription(
    extracted.description,
    `Detected from Gmail ${lifecycle.lifecycleEmailType.toLowerCase()} email`
  );

  const type =
    lifecycle.lifecycleEmailType === "RENEWAL"
      ? "RENEWAL"
      : lifecycle.lifecycleEmailType === "WELCOME" ||
          lifecycle.lifecycleEmailType === "RECEIPT" ||
          lifecycle.lifecycleEmailType === "CANCELLATION"
        ? "SUBSCRIPTION"
        : extracted.type;

  return {
    ...extracted,
    type,
    title,
    description,
    vendor,
    amount,
    currency,
    dueDate,
    recurrence,
    fieldConfidence: {
      ...extracted.fieldConfidence,
      title: title ? Math.max(extracted.fieldConfidence.title, 0.78) : extracted.fieldConfidence.title,
      vendor: vendor ? Math.max(extracted.fieldConfidence.vendor, 0.78) : extracted.fieldConfidence.vendor,
      amount: amount !== null ? Math.max(extracted.fieldConfidence.amount, 0.7) : extracted.fieldConfidence.amount,
      dueDate: dueDate ? Math.max(extracted.fieldConfidence.dueDate, 0.72) : extracted.fieldConfidence.dueDate,
      recurrence:
        recurrence ? Math.max(extracted.fieldConfidence.recurrence, 0.7) : extracted.fieldConfidence.recurrence
    }
  };
}

function applyGmailLifecycleConfidenceHint(
  confidence: ConfidenceEvaluation,
  lifecycle: GmailSubscriptionHeuristicResult | null
): ConfidenceEvaluation {
  if (!lifecycle) return confidence;
  if (lifecycle.lifecycleEmailType === "UNKNOWN") {
    // Unknown lifecycle should not down-rank base ingestion confidence.
    return confidence;
  }

  const lifecycleScore = lifecycle.confidence.confidenceScore;
  const mergedScore = clamp(confidence.score * 0.62 + lifecycleScore * 0.38, 0, 1);
  const mergedBand = mergedScore >= 0.78 ? "HIGH" : mergedScore >= 0.48 ? "MEDIUM" : "LOW";
  const mergedRationale = Array.from(
    new Set([
      ...confidence.rationale,
      ...lifecycle.confidence.rationaleSignals,
      ...lifecycle.confidence.reviewReasons
    ])
  );

  if (lifecycle.confidence.shouldIgnore && mergedScore < 0.5) {
    return {
      ...confidence,
      score: mergedScore,
      band: mergedBand,
      needsConfirmation: true,
      shouldCreateObligation: false,
      importParseStatus: ImportParseStatus.PARTIAL,
      obligationStatus: null,
      rationale: mergedRationale
    };
  }

  if (mergedScore >= 0.78 && lifecycle.confidence.confidenceBand === "HIGH") {
    return {
      ...confidence,
      score: mergedScore,
      band: "HIGH",
      needsConfirmation: false,
      shouldCreateObligation: true,
      importParseStatus: ImportParseStatus.READY,
      obligationStatus: ObligationStatus.ACTIVE,
      rationale: mergedRationale
    };
  }

  if (mergedScore >= 0.48) {
    return {
      ...confidence,
      score: mergedScore,
      band: mergedBand,
      needsConfirmation: true,
      shouldCreateObligation: true,
      importParseStatus: ImportParseStatus.NEEDS_CONFIRMATION,
      obligationStatus: ObligationStatus.DRAFT,
      rationale: mergedRationale
    };
  }

  return {
    ...confidence,
    score: mergedScore,
    band: mergedBand,
    needsConfirmation: true,
    shouldCreateObligation: confidence.shouldCreateObligation,
    importParseStatus: confidence.shouldCreateObligation
      ? ImportParseStatus.NEEDS_CONFIRMATION
      : ImportParseStatus.PARTIAL,
    obligationStatus: confidence.shouldCreateObligation ? ObligationStatus.DRAFT : null,
    rationale: mergedRationale
  };
}

function shouldSuppressForLifecycleMatch(
  lifecycle: GmailSubscriptionHeuristicResult,
  confidence: ConfidenceEvaluation
) {
  if (lifecycle.lifecycleEmailType === "UNKNOWN") return false;
  if (lifecycle.confidence.confidenceBand === "LOW") return false;
  if (lifecycle.lifecycleEmailType === "CANCELLATION") {
    return lifecycle.confidence.confidenceScore >= 0.56;
  }
  return confidence.score >= 0.48 || lifecycle.confidence.confidenceScore >= 0.58;
}

function scoreLifecycleMatchCandidate(
  candidate: {
    title: string;
    vendor: string | null;
    amount: Prisma.Decimal | null;
    recurrence: string | null;
    status: ObligationStatus;
  },
  lifecycle: GmailSubscriptionHeuristicResult
) {
  const vendor = lifecycle.extraction.vendor;
  if (!vendor) return 0;

  let score = 0;
  const incomingVendor = normalizeKey(vendor);
  const candidateVendor = normalizeKey(candidate.vendor ?? "");
  if (incomingVendor && candidateVendor) {
    if (incomingVendor === candidateVendor) score += 0.56;
    else if (candidateVendor.includes(incomingVendor) || incomingVendor.includes(candidateVendor)) {
      score += 0.42;
    }
  }

  const planName = lifecycle.extraction.planName;
  if (planName && candidate.title.toLowerCase().includes(planName.toLowerCase())) {
    score += 0.22;
  }

  const incomingAmount =
    lifecycle.extraction.recurringPrice ??
    lifecycle.extraction.amountCharged ??
    lifecycle.extraction.introPrice;
  const candidateAmount = decimalToNumber(candidate.amount);
  if (
    incomingAmount !== null &&
    candidateAmount !== null &&
    Math.abs(incomingAmount - candidateAmount) <= 0.51
  ) {
    score += 0.18;
  }

  if (
    lifecycle.extraction.billingPeriod !== "UNKNOWN" &&
    candidate.recurrence &&
    candidate.recurrence.toLowerCase().includes(lifecycle.extraction.billingPeriod.toLowerCase())
  ) {
    score += 0.1;
  }

  if (candidate.status === ObligationStatus.IGNORED) {
    score -= 0.18;
  }

  return clamp(score, 0, 1);
}

function buildLifecycleObligationUpdate(input: {
  existing: {
    title: string;
    amount: Prisma.Decimal | null;
    currency: string | null;
    dueDate: Date | null;
    recurrence: string | null;
    status: ObligationStatus;
  };
  lifecycle: GmailSubscriptionHeuristicResult;
}): Prisma.ObligationUpdateInput | null {
  const data: Prisma.ObligationUpdateInput = {};
  const nextAmount =
    input.lifecycle.extraction.amountCharged ??
    input.lifecycle.extraction.recurringPrice ??
    input.lifecycle.extraction.introPrice;

  if (input.existing.amount === null && nextAmount !== null) {
    data.amount = nextAmount;
  }
  if (!input.existing.currency && input.lifecycle.extraction.currency) {
    data.currency = input.lifecycle.extraction.currency;
  }

  const candidateDueDate = parseLifecycleDueDate(input.lifecycle);
  if (!input.existing.dueDate && candidateDueDate) {
    data.dueDate = candidateDueDate;
  }

  const recurrence = mapLifecycleBillingPeriodToRecurrence(input.lifecycle.extraction.billingPeriod);
  if (!input.existing.recurrence && recurrence) {
    data.recurrence = recurrence;
  }

  if (
    isGenericTitle(input.existing.title) &&
    input.lifecycle.extraction.subscriptionName &&
    input.lifecycle.extraction.subscriptionName.length > 2
  ) {
    data.title = input.lifecycle.extraction.subscriptionName;
  }

  const cancellationDetected =
    input.lifecycle.lifecycleEmailType === "CANCELLATION" &&
    (input.lifecycle.confidence.confidenceScore >= 0.72 ||
      input.lifecycle.extraction.autoRenewStatus === "OFF" ||
      Boolean(input.lifecycle.extraction.cancellationEffectiveDate));

  if (cancellationDetected && input.existing.status !== ObligationStatus.RESOLVED) {
    data.status = ObligationStatus.RESOLVED;
    data.lastActedAt = new Date();
  }

  return Object.keys(data).length > 0 ? data : null;
}

function detectLifecycleConflict(
  lifecycle: GmailSubscriptionHeuristicResult,
  existing: {
    status: ObligationStatus;
    recurrence: string | null;
    dueDate: Date | null;
  }
) {
  if (
    lifecycle.lifecycleEmailType === "CANCELLATION" &&
    existing.status === ObligationStatus.ACTIVE &&
    existing.recurrence
  ) {
    const effectiveDate = parseLifecycleDueDate(lifecycle);
    if (effectiveDate && existing.dueDate && existing.dueDate.getTime() > effectiveDate.getTime()) {
      return true;
    }
  }

  if (
    (lifecycle.lifecycleEmailType === "RECEIPT" || lifecycle.lifecycleEmailType === "RENEWAL") &&
    existing.status === ObligationStatus.RESOLVED
  ) {
    return true;
  }

  return false;
}

function summarizeGmailLifecycle(lifecycle: GmailSubscriptionHeuristicResult | null) {
  if (!lifecycle) return null;

  return {
    lifecycleEmailType: lifecycle.lifecycleEmailType,
    subscriptionLikelihood: lifecycle.classification.subscriptionLikelihood,
    classConfidence: lifecycle.classification.classConfidence,
    confidenceScore: lifecycle.confidence.confidenceScore,
    confidenceBand: lifecycle.confidence.confidenceBand,
    rationaleSignals: lifecycle.confidence.rationaleSignals,
    reviewReasons: lifecycle.confidence.reviewReasons,
    extraction: lifecycle.extraction
  };
}

function parseLifecycleDueDate(lifecycle: GmailSubscriptionHeuristicResult) {
  const value =
    lifecycle.extraction.renewalDate ??
    lifecycle.extraction.cancellationEffectiveDate ??
    lifecycle.extraction.trialEndDate ??
    lifecycle.extraction.receiptDate;
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function mapLifecycleBillingPeriodToRecurrence(value: string) {
  if (value === "MONTHLY") return "MONTHLY";
  if (value === "YEARLY") return "YEARLY";
  if (value === "QUARTERLY") return "QUARTERLY";
  return null;
}

function mergeDescription(current: string | null, next: string) {
  if (!current) return next;
  if (current.toLowerCase().includes(next.toLowerCase())) return current;
  return `${current}. ${next}`;
}

function isGenericTitle(value: string | null) {
  if (!value) return true;
  const normalized = value.toLowerCase();
  return (
    normalized.includes("obligation") ||
    normalized === "subscription" ||
    normalized === "renewal" ||
    normalized === "bill"
  );
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function toOptionalDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid dueDate", 400, {
      dueDate: value
    });
  }

  return date;
}

function calculateConfirmedConfidence(current: Prisma.Decimal) {
  const currentValue = Number(current);
  return currentValue >= 0.85 ? currentValue : Math.min(0.9, currentValue + 0.15);
}

function computeUrgencyScore(dueDateIso: string | null, confidenceScore: number) {
  if (!dueDateIso) {
    return confidenceScore >= 0.78 ? 58 : 45;
  }

  const dueDate = new Date(dueDateIso);
  const now = new Date();
  const msRemaining = dueDate.getTime() - now.getTime();
  const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

  if (daysRemaining <= 0) return 95;
  if (daysRemaining <= 1) return 90;
  if (daysRemaining <= 3) return 84;
  if (daysRemaining <= 7) return 76;
  if (daysRemaining <= 14) return 66;
  return 52;
}

function computeImportanceScore(
  type: SupportedObligationType,
  amount: number | null,
  confidenceScore: number
) {
  let score =
    type === "BILL"
      ? 68
      : type === "RENEWAL"
        ? 64
        : type === "SUBSCRIPTION"
          ? 58
          : 55;

  if (amount !== null) {
    if (amount >= 500) score += 24;
    else if (amount >= 150) score += 16;
    else if (amount >= 50) score += 10;
    else score += 5;
  }

  if (confidenceScore < 0.5) score -= 10;
  if (confidenceScore >= 0.78) score += 6;

  return clamp(score, 30, 98);
}

function computeEffortLevel(type: SupportedObligationType) {
  if (type === "SUBSCRIPTION") return "LOW";
  return "MEDIUM";
}

function computeImpactLevel(amount: number | null, importanceScore: number) {
  if ((amount !== null && amount >= 300) || importanceScore >= 82) {
    return "HIGH" as const;
  }

  if ((amount !== null && amount >= 50) || importanceScore >= 60) {
    return "MEDIUM" as const;
  }

  return "LOW" as const;
}

function applyValidationGuards(
  confidence: ConfidenceEvaluation,
  input: {
    conflictDetected: boolean;
  }
): ConfidenceEvaluation {
  if (!input.conflictDetected) {
    return confidence;
  }

  const penalizedScore = Math.min(confidence.score, 0.64);
  return {
    ...confidence,
    score: penalizedScore,
    band: penalizedScore >= 0.78 ? "HIGH" : penalizedScore >= 0.48 ? "MEDIUM" : "LOW",
    needsConfirmation: true,
    importParseStatus: ImportParseStatus.NEEDS_CONFIRMATION,
    obligationStatus: ObligationStatus.DRAFT,
    rationale: [...confidence.rationale, "conflict_detected"]
  };
}

function decimalToNumber(value: Prisma.Decimal | null) {
  return value ? Number(value) : null;
}

function toTitle(value: string) {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}
