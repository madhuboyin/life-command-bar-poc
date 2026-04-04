import {
  ImportParseStatus,
  ImportSourceSubtype,
  Obligation,
  Prisma
} from "@prisma/client";
import {
  getExtractedFieldsFromSummary,
  getExtractionSummaryRecord,
  resolveNeedsReview,
  sourceLabelFromType,
  sourceTypeFromObligation,
  toConfidenceBand
} from "./trust-layer";

type ObligationImportSource = {
  id: string;
  subtype: ImportSourceSubtype | null;
  parseStatus: ImportParseStatus;
  parseConfidence: Prisma.Decimal;
  parserVersion: string | null;
  extractionSummary: Prisma.JsonValue | null;
  rawData: Prisma.JsonValue | null;
  createdAt: Date;
};

type ObligationWithRelations = Obligation & {
  importSource?: ObligationImportSource | null;
  assignedToUser?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  createdByUser?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  lastHandledByUser?: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? Number(value) : null;
}

export function mapObligation(obligation: ObligationWithRelations) {
  const source = obligation.importSource ?? null;
  const summary = getExtractionSummaryRecord(source?.extractionSummary);
  const validation = asRecord(summary?.validation);
  const duplicateCandidate = Boolean(validation?.duplicateCandidate);
  const conflictDetected = Boolean(validation?.conflictDetected);

  const sourceType = sourceTypeFromObligation({
    source: obligation.source,
    subtype: source?.subtype
  });
  const provenanceLabel =
    source?.subtype === ImportSourceSubtype.GMAIL_READONLY
      ? "Imported from Gmail"
      : sourceLabelFromType(sourceType);
  const ingestionConfidence = source
    ? Number(source.parseConfidence)
    : Number(obligation.confidenceScore);
  const confidenceBand = toConfidenceBand(ingestionConfidence);
  const parseStatus = source?.parseStatus ?? null;
  const extractedFields = getExtractedFieldsFromSummary(summary);
  const needsReview = resolveNeedsReview({
    obligationStatus: obligation.status,
    confidenceBand,
    parseStatus,
    conflictDetected,
    duplicateCandidate
  });

  return {
    id: obligation.id,
    userId: obligation.userId,
    scopeType: obligation.scopeType,
    householdId: obligation.householdId,
    assignedToUserId: obligation.assignedToUserId,
    createdByUserId: obligation.createdByUserId,
    lastHandledByUserId: obligation.lastHandledByUserId,
    assignee: obligation.assignedToUser
      ? {
          id: obligation.assignedToUser.id,
          email: obligation.assignedToUser.email,
          name: obligation.assignedToUser.name
        }
      : null,
    createdBy: obligation.createdByUser
      ? {
          id: obligation.createdByUser.id,
          email: obligation.createdByUser.email,
          name: obligation.createdByUser.name
        }
      : null,
    lastHandledBy: obligation.lastHandledByUser
      ? {
          id: obligation.lastHandledByUser.id,
          email: obligation.lastHandledByUser.email,
          name: obligation.lastHandledByUser.name
        }
      : null,
    type: obligation.type,
    title: obligation.title,
    description: obligation.description,
    vendor: obligation.vendor,
    amount: decimalToNumber(obligation.amount),
    currency: obligation.currency,
    dueDate: obligation.dueDate?.toISOString() ?? null,
    recurrence: obligation.recurrence,
    source: obligation.source,
    importSourceId: obligation.importSourceId,
    sourceType,
    sourceMetadata: {
      importSourceId: source?.id ?? null,
      sourceSubtype: source?.subtype ?? null,
      importedAt: source?.createdAt.toISOString() ?? null,
      parserVersion: source?.parserVersion ?? null,
      parseStatus,
      parseConfidence: source ? Number(source.parseConfidence) : null,
      provenanceLabel,
      rawData: source?.rawData ?? null,
      duplicateOfObligationId:
        typeof validation?.duplicateOfObligationId === "string"
          ? validation.duplicateOfObligationId
          : null,
      conflictWithObligationId:
        typeof validation?.conflictWithObligationId === "string"
          ? validation.conflictWithObligationId
          : null
    },
    ingestionConfidence,
    confidenceBand,
    extractedFields,
    extractionStatus: parseStatus,
    needsReview,
    duplicateCandidate,
    conflictDetected,
    confidenceScore: Number(obligation.confidenceScore),
    urgencyScore: Number(obligation.urgencyScore),
    importanceScore: Number(obligation.importanceScore),
    effortLevel: obligation.effortLevel,
    impactLevel: obligation.impactLevel,
    status: obligation.status,
    lastShownAt: obligation.lastShownAt?.toISOString() ?? null,
    lastActedAt: obligation.lastActedAt?.toISOString() ?? null,
    createdAt: obligation.createdAt.toISOString(),
    updatedAt: obligation.updatedAt.toISOString()
  };
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
