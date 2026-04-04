import {
  PredictionConfidenceBand,
  PredictionReferenceType,
  PredictionType,
  Prisma
} from "@prisma/client";

export type PredictionDraft = {
  predictionType: PredictionType;
  referenceType: PredictionReferenceType;
  referenceId: string;
  title: string;
  description: string;
  predictedDate?: Date | null;
  predictionWindowStart?: Date | null;
  predictionWindowEnd?: Date | null;
  confidenceScore: number;
  confidenceBand: PredictionConfidenceBand;
  rationale: Prisma.InputJsonValue;
  rationaleSummary: string;
};
