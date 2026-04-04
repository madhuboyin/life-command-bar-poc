import {
  classifyGmailSubscriptionLifecycle,
  type GmailSubscriptionClassificationResult,
  type GmailSubscriptionLifecycleEmailType
} from "./gmail-subscription-classifier";
import {
  extractGmailSubscriptionDetails,
  type GmailSubscriptionExtractionResult
} from "./gmail-subscription-extractor";
import {
  evaluateGmailSubscriptionConfidence,
  type GmailSubscriptionConfidenceResult
} from "./gmail-subscription-confidence";
import { ExternalAccountRepository } from "../repositories/external-account.repository";

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
  const classification = classifyGmailSubscriptionLifecycle({
    subject: input.subject,
    from: input.from,
    bodyText: input.bodyText,
    snippet: input.snippet,
    matchedQueryKey: input.matchedQueryKey
  });

  const extraction = extractGmailSubscriptionDetails({
    lifecycleEmailType: classification.lifecycleEmailType,
    subject: input.subject,
    from: input.from,
    bodyText: input.bodyText,
    snippet: input.snippet,
    messageDate: input.messageDate
  });

  const repository = new ExternalAccountRepository();
  const history = await repository.checkVendorHistory(input.userId, extraction.vendor);

  const confidence = evaluateGmailSubscriptionConfidence({
    classification,
    extraction,
    context: {
      ...input.context,
      history
    }
  });

  return {
    lifecycleEmailType: classification.lifecycleEmailType,
    classification,
    extraction,
    confidence,
    vendorHistory: history
  };
}
