import { ImportParseStatus, ObligationStatus } from "@prisma/client";
import { ClassificationResult } from "./ingestion.classifier";
import { ExtractedFields } from "./ingestion.extractor";
import { IngestionChannel } from "./ingestion-normalizers";

export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export type ConfidenceEvaluation = {
  score: number;
  band: ConfidenceBand;
  needsConfirmation: boolean;
  shouldCreateObligation: boolean;
  importParseStatus: ImportParseStatus;
  obligationStatus: ObligationStatus | null;
  rationale: string[];
};

type ConfidenceInput = {
  channel: IngestionChannel;
  classification: ClassificationResult;
  extracted: ExtractedFields;
  hasUsableText: boolean;
};

const channelReliability: Record<IngestionChannel, number> = {
  EMAIL_FORWARD: 0.76,
  FILE_UPLOAD: 0.62,
  COMMAND_CAPTURE: 0.82
};

export function evaluateIngestionConfidence(input: ConfidenceInput): ConfidenceEvaluation {
  const rationale: string[] = [];

  const sourceReliability = input.hasUsableText
    ? channelReliability[input.channel]
    : input.channel === "FILE_UPLOAD"
      ? 0.35
      : channelReliability[input.channel] * 0.55;

  if (!input.hasUsableText) {
    rationale.push("missing_or_weak_text_signal");
  }

  const titleScore = input.extracted.fieldConfidence.title;
  const vendorScore = input.extracted.fieldConfidence.vendor;
  const amountScore = input.extracted.fieldConfidence.amount;
  const dueDateScore = input.extracted.fieldConfidence.dueDate;
  const recurrenceScore = input.extracted.fieldConfidence.recurrence;

  const extractionStrength = clamp(
    titleScore * 0.28 +
      vendorScore * 0.18 +
      amountScore * 0.2 +
      dueDateScore * 0.24 +
      recurrenceScore * 0.1,
    0,
    1
  );

  const keyFieldCount = [
    input.extracted.title,
    input.extracted.vendor,
    input.extracted.amount,
    input.extracted.dueDate,
    input.extracted.recurrence
  ].filter((value) => value !== null && value !== "").length;

  const keyFieldBonus = keyFieldCount >= 3 ? 0.06 : keyFieldCount >= 2 ? 0.03 : 0;

  let score =
    sourceReliability * 0.28 +
    input.classification.confidence * 0.34 +
    extractionStrength * 0.38 +
    keyFieldBonus;

  if (!input.extracted.title) {
    score -= 0.12;
    rationale.push("missing_title");
  }

  if (input.classification.confidence < 0.55) {
    score -= 0.08;
    rationale.push("ambiguous_type_classification");
  }

  score = clamp(score, 0, 1);

  if (score >= 0.78 && keyFieldCount >= 2) {
    return {
      score,
      band: "HIGH",
      needsConfirmation: false,
      shouldCreateObligation: true,
      importParseStatus: ImportParseStatus.READY,
      obligationStatus: ObligationStatus.ACTIVE,
      rationale
    };
  }

  const hasMeaningfulSignal =
    Boolean(input.extracted.title) ||
    Boolean(input.extracted.vendor) ||
    input.extracted.amount !== null ||
    Boolean(input.extracted.dueDate);

  if (score >= 0.48 && hasMeaningfulSignal) {
    return {
      score,
      band: "MEDIUM",
      needsConfirmation: true,
      shouldCreateObligation: true,
      importParseStatus: ImportParseStatus.NEEDS_CONFIRMATION,
      obligationStatus: ObligationStatus.DRAFT,
      rationale
    };
  }

  if (hasMeaningfulSignal) {
    rationale.push("low_confidence_but_structured_signal_present");
    return {
      score,
      band: "LOW",
      needsConfirmation: true,
      shouldCreateObligation: true,
      importParseStatus: ImportParseStatus.NEEDS_CONFIRMATION,
      obligationStatus: ObligationStatus.DRAFT,
      rationale
    };
  }

  rationale.push("insufficient_structured_signal");
  return {
    score,
    band: "LOW",
    needsConfirmation: true,
    shouldCreateObligation: false,
    importParseStatus: ImportParseStatus.PARTIAL,
    obligationStatus: null,
    rationale
  };
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}
