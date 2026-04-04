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

export type GmailSubscriptionHeuristicResult = {
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  classification: GmailSubscriptionClassificationResult;
  extraction: GmailSubscriptionExtractionResult;
  confidence: GmailSubscriptionConfidenceResult;
};

type HeuristicInput = {
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

export function runGmailSubscriptionHeuristics(
  input: HeuristicInput
): GmailSubscriptionHeuristicResult {
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

  const confidence = evaluateGmailSubscriptionConfidence({
    classification,
    extraction,
    context: input.context
  });

  return {
    lifecycleEmailType: classification.lifecycleEmailType,
    classification,
    extraction,
    confidence
  };
}
