import {
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
  CreateObligationFromIngestionInput,
  IngestionRepository
} from "../repositories/ingestion.repository";
import {
  classifyObligationType,
  type SupportedObligationType
} from "./ingestion.classifier";
import {
  evaluateIngestionConfidence,
  type ConfidenceBand
} from "./ingestion.confidence";
import { extractStructuredFields } from "./ingestion.extractor";
import {
  normalizeCommandCaptureInput,
  normalizeEmailForwardInput,
  normalizeUploadInput,
  type NormalizedIngestionInput
} from "./ingestion-normalizers";

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
  duplicateOfObligationId: string | null;
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
    if (!source) {
      return {
        obligationId: obligation.id,
        sourceType: obligation.source,
        sourceSubtype: null,
        parseStatus: null,
        parseConfidence: null,
        parserVersion: null,
        importedAt: null,
        extractionSummary: null,
        provenanceLabel: obligation.source === "MANUAL" ? "Created manually" : "Created in app",
        rawData: null
      };
    }

    return {
      obligationId: obligation.id,
      sourceType: obligation.source,
      sourceSubtype: source.subtype,
      parseStatus: source.parseStatus,
      parseConfidence: Number(source.parseConfidence),
      parserVersion: source.parserVersion,
      importedAt: source.createdAt.toISOString(),
      extractionSummary: source.extractionSummary,
      provenanceLabel: buildProvenanceLabel(source.subtype),
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

      return {
        importSourceId: importSource.id,
        candidateId: existing.id,
        obligationId: existing.id,
        status: "DUPLICATE",
        parseStatus: ImportParseStatus.REJECTED,
        confidence: Number(existing.confidenceScore),
        confidenceBand: Number(existing.confidenceScore) >= 0.78 ? "HIGH" : Number(existing.confidenceScore) >= 0.48 ? "MEDIUM" : "LOW",
        needsConfirmation: existing.status !== ObligationStatus.ACTIVE,
        needsReview: existing.status !== ObligationStatus.ACTIVE,
        isDuplicate: true,
        duplicateOfObligationId: existing.id,
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
    }

    const classification = classifyObligationType(
      normalized.normalizedText,
      normalized.titleHint
    );

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      eventType: "ingestion_classified",
      metadata: {
        importSourceId: importSource.id,
        type: classification.type,
        confidence: classification.confidence,
        scores: classification.scores,
        matchedIndicators: classification.matchedIndicators
      }
    });

    const extracted = extractStructuredFields({
      channel: normalized.channel,
      classificationType: classification.type,
      rawText: normalized.rawText,
      normalizedText: normalized.normalizedText,
      titleHint: normalized.titleHint,
      metadata: normalized.metadata,
      now: new Date()
    });

    const confidence = evaluateIngestionConfidence({
      channel: normalized.channel,
      classification,
      extracted,
      hasUsableText: options.hasUsableText
    });

    await this.repository.updateImportSourceParseResult({
      importSourceId: importSource.id,
      parseStatus: confidence.importParseStatus,
      parseConfidence: confidence.score,
      extractionSummary: {
        classification,
        extracted,
        confidence: {
          score: confidence.score,
          band: confidence.band,
          rationale: confidence.rationale
        }
      }
    });

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      eventType: "ingestion_extracted",
      metadata: {
        importSourceId: importSource.id,
        score: confidence.score,
        band: confidence.band,
        parseStatus: confidence.importParseStatus
      }
    });

    if (!confidence.shouldCreateObligation || !confidence.obligationStatus) {
      await this.repository.createAuditEvent({
        userId: normalized.userId,
        eventType: "ingestion_candidate_skipped",
        metadata: {
          importSourceId: importSource.id,
          reason: "insufficient_confidence"
        }
      });

      return {
        importSourceId: importSource.id,
        candidateId: null,
        obligationId: null,
        status: "NO_CANDIDATE",
        parseStatus: confidence.importParseStatus,
        confidence: confidence.score,
        confidenceBand: confidence.band,
        needsConfirmation: true,
        needsReview: true,
        isDuplicate: false,
        duplicateOfObligationId: null,
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
    }

    const obligationInput = this.buildObligationPayload({
      userId: normalized.userId,
      importSourceId: importSource.id,
      extracted,
      sourceStatus: confidence.obligationStatus,
      score: confidence.score,
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

    await this.repository.createAuditEvent({
      userId: normalized.userId,
      obligationId: obligation.id,
      eventType: "ingestion_candidate_created",
      metadata: {
        importSourceId: importSource.id,
        status: obligation.status,
        confidence: confidence.score,
        confidenceBand: confidence.band
      }
    });

    const obligationStatus =
      obligation.status === ObligationStatus.ACTIVE ? "ACTIVE" : "DRAFT";

    return {
      importSourceId: importSource.id,
      candidateId: obligation.id,
      obligationId: obligation.id,
      status: obligationStatus,
      parseStatus: confidence.importParseStatus,
      confidence: confidence.score,
      confidenceBand: confidence.band,
      needsConfirmation: confidence.needsConfirmation,
      needsReview: confidence.needsConfirmation,
      isDuplicate: false,
      duplicateOfObligationId: null,
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

function buildProvenanceLabel(subtype: string | null) {
  if (subtype === "EMAIL_FORWARD") return "Imported from forwarded email";
  if (subtype === "FILE_UPLOAD") return "Extracted from uploaded file";
  if (subtype === "COMMAND_CAPTURE") return "Captured from command input";
  return "Imported from external source";
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
