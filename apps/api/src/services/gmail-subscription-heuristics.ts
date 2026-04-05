import type {
  GmailSubscriptionClassificationResult,
  GmailSubscriptionLifecycleEmailType
} from "./gmail-subscription-classifier";
import type { GmailSubscriptionExtractionResult } from "./gmail-subscription-extractor";
import type { GmailSubscriptionConfidenceResult } from "./gmail-subscription-confidence";
import {
  GmailIntelligenceService,
  type GmailIntelligenceV2Details
} from "./gmail-intelligence.service";

export type GmailSubscriptionHeuristicResult = {
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  classification: GmailSubscriptionClassificationResult;
  extraction: GmailSubscriptionExtractionResult;
  confidence: GmailSubscriptionConfidenceResult;
  vendorHistory?: {
    hasPriorVendor: boolean;
    isUnknownVendor: boolean;
    hasRejectedHistory: boolean;
  };
  intelligenceV2?: GmailIntelligenceV2Details;
};

type HeuristicInput = {
  userId: string;
  subject: string;
  from: string;
  bodyText: string;
  snippet: string;
  messageDate: string | null;
  matchedQueryKey?: string;
  context?: {
    hasExistingMatch?: boolean;
    hasLifecycleConflict?: boolean;
    sourceQualityPenalty?: boolean;
  };
};

export async function runGmailSubscriptionHeuristics(
  input: HeuristicInput
): Promise<GmailSubscriptionHeuristicResult> {
  const service = new GmailIntelligenceService();
  return service.analyzeMessage({
    userId: input.userId,
    subject: input.subject,
    from: input.from,
    bodyText: input.bodyText,
    snippet: input.snippet,
    messageDate: input.messageDate,
    matchedQueryKey: input.matchedQueryKey
  });
}
