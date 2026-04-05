import { ExternalAccountRepository } from "../repositories/external-account.repository";
import type { GmailSubscriptionHeuristicResult } from "./gmail-subscription-heuristics";
import {
  classifyGmailMessageV2,
  type GmailClassifierV2Result
} from "./gmail-classifier-v2";
import { extractGmailFieldsV2, type GmailFieldExtractionV2Result } from "./gmail-field-extractor-v2";
import { evaluateGmailConfidenceV2 } from "./gmail-confidence-engine";
import { routeGmailIntelligenceResult, type GmailRoutingDecision } from "./gmail-routing-engine";
import { evaluateGmailLlmGate, type GmailLlmGateResult } from "./gmail-llm-gate";
import { linkGmailLifecycleSignal, type GmailLifecycleLinkResult } from "./gmail-lifecycle-linker";
import { VendorIntelligenceService } from "./vendor-intelligence.service";
import type { VendorCategory } from "./vendor-profiles";

type AnalyzeInput = {
  userId: string;
  subject: string;
  from: string;
  bodyText: string;
  snippet: string;
  messageDate: string | null;
  matchedQueryKey?: string;
};

export type GmailIntelligenceV2Details = {
  vendor: {
    outcome: string;
    vendorKey: string | null;
    canonicalName: string | null;
    category: VendorCategory;
    score: number;
    conflicts: Array<{
      vendorKey: string;
      canonicalName: string;
      score: number;
    }>;
  };
  classifier: GmailClassifierV2Result;
  lifecycleLink: GmailLifecycleLinkResult;
  llmGate: GmailLlmGateResult;
  routing: GmailRoutingDecision;
  extractionConflicts: string[];
  extractionRationale: string[];
};

export class GmailIntelligenceService {
  private readonly repository = new ExternalAccountRepository();
  private readonly vendorIntelligenceService = new VendorIntelligenceService();

  async analyzeMessage(input: AnalyzeInput): Promise<GmailSubscriptionHeuristicResult> {
    const vendorResolution = await this.vendorIntelligenceService.resolveVendorIdentity({
      userId: input.userId,
      candidateVendorName: null,
      sender: input.from,
      subject: input.subject,
      bodyText: input.bodyText,
      snippet: input.snippet,
      lifecycleTypeHint: toLifecycleHintFromQuery(input.matchedQueryKey),
      expectedCategoryHint: toExpectedCategoryFromQuery(input.matchedQueryKey),
      source: "gmail_intelligence_v2",
      referenceId: null,
      emitAudit: true
    });

    const classification = classifyGmailMessageV2({
      subject: input.subject,
      bodyText: input.bodyText,
      snippet: input.snippet,
      matchedQueryKey: input.matchedQueryKey,
      vendorMatch: vendorResolution.match
    });

    const extractionV2 = extractGmailFieldsV2({
      classification,
      vendorMatch: vendorResolution.match,
      subject: input.subject,
      from: input.from,
      bodyText: input.bodyText,
      snippet: input.snippet,
      messageDate: input.messageDate
    });

    const history = await this.repository.checkVendorHistory(input.userId, extractionV2.extraction.vendor);
    const lifecycleLink = await linkGmailLifecycleSignal({
      userId: input.userId,
      classification,
      extraction: extractionV2.extraction,
      observedAtIso: input.messageDate
    });

    const confidence = evaluateGmailConfidenceV2({
      classification,
      extractionV2,
      vendorMatch: vendorResolution.match,
      lifecycleLink,
      history
    });

    const llmGate = evaluateGmailLlmGate({
      classification,
      extraction: extractionV2,
      vendorMatch: vendorResolution.match,
      bodyText: input.bodyText
    });

    const routing = routeGmailIntelligenceResult({
      confidence,
      classification,
      extraction: extractionV2,
      lifecycleLink
    });

    await this.emitIntelligenceEvents({
      userId: input.userId,
      matchedQueryKey: input.matchedQueryKey,
      vendorResolution,
      classification,
      extraction: extractionV2,
      lifecycleLink,
      llmGate,
      routing,
      confidenceScore: confidence.confidenceScore,
      confidenceBand: confidence.confidenceBand
    });

    return {
      lifecycleEmailType: classification.lifecycleEmailType,
      classification: {
        lifecycleEmailType: classification.lifecycleEmailType,
        subscriptionLikelihood: classification.subscriptionLikelihood,
        classConfidence: classification.classConfidence,
        rationaleSignals: classification.rationaleSignals,
        cautionSignals: classification.cautionSignals,
        classScores: {
          WELCOME: classification.classScores.SUBSCRIPTION_WELCOME,
          RENEWAL: classification.classScores.SUBSCRIPTION_RENEWAL,
          RECEIPT: classification.classScores.SUBSCRIPTION_RECEIPT,
          CANCELLATION: classification.classScores.SUBSCRIPTION_CANCELLATION,
          UNKNOWN: classification.classScores.UNKNOWN
        }
      },
      extraction: extractionV2.extraction,
      confidence: {
        ...confidence,
        rationaleSignals: Array.from(
          new Set([
            ...confidence.rationaleSignals,
            `routing:${routing.action.toLowerCase()}`,
            ...extractionV2.rationale.map((entry) => `v2:${entry}`)
          ])
        ),
        reviewReasons: Array.from(new Set([...confidence.reviewReasons, routing.reason]))
      },
      vendorHistory: history,
      intelligenceV2: {
        vendor: {
          outcome: vendorResolution.match.outcome,
          vendorKey: vendorResolution.match.vendorKey,
          canonicalName: vendorResolution.match.canonicalName,
          category: vendorResolution.match.category,
          score: vendorResolution.match.score,
          conflicts: vendorResolution.match.conflicts.map((entry) => ({
            vendorKey: entry.vendorKey,
            canonicalName: entry.canonicalName,
            score: entry.score
          }))
        },
        classifier: classification,
        lifecycleLink,
        llmGate,
        routing,
        extractionConflicts: extractionV2.conflicts,
        extractionRationale: extractionV2.rationale
      }
    };
  }

  private async emitIntelligenceEvents(input: {
    userId: string;
    matchedQueryKey?: string;
    vendorResolution: Awaited<ReturnType<VendorIntelligenceService["resolveVendorIdentity"]>>;
    classification: GmailClassifierV2Result;
    extraction: GmailFieldExtractionV2Result;
    lifecycleLink: GmailLifecycleLinkResult;
    llmGate: GmailLlmGateResult;
    routing: GmailRoutingDecision;
    confidenceScore: number;
    confidenceBand: string;
  }) {
    await this.repository.createAuditEvent({
      userId: input.userId,
      eventType: "gmail_vendor_matched",
      metadata: {
        matchedQueryKey: input.matchedQueryKey ?? null,
        outcome: input.vendorResolution.match.outcome,
        vendorKey: input.vendorResolution.match.vendorKey,
        canonicalName: input.vendorResolution.match.canonicalName,
        category: input.vendorResolution.match.category,
        score: input.vendorResolution.match.score
      }
    });

    await this.repository.createAuditEvent({
      userId: input.userId,
      eventType: "gmail_message_classified_v2",
      metadata: {
        matchedQueryKey: input.matchedQueryKey ?? null,
        classType: input.classification.classType,
        lifecycleEmailType: input.classification.lifecycleEmailType,
        classConfidence: input.classification.classConfidence,
        subscriptionLikelihood: input.classification.subscriptionLikelihood,
        confidenceScore: input.confidenceScore,
        confidenceBand: input.confidenceBand
      }
    });

    if (input.lifecycleLink.linkedSubscriptionId) {
      await this.repository.createAuditEvent({
        userId: input.userId,
        eventType: "gmail_lifecycle_linked",
        metadata: {
          matchedQueryKey: input.matchedQueryKey ?? null,
          linkedSubscriptionId: input.lifecycleLink.linkedSubscriptionId,
          linkedLifecycleState: input.lifecycleLink.linkedLifecycleState,
          matchScore: input.lifecycleLink.matchScore,
          conflictSignals: input.lifecycleLink.conflictSignals
        }
      });
    }

    if (input.extraction.conflicts.length > 0) {
      await this.repository.createAuditEvent({
        userId: input.userId,
        eventType: "gmail_extraction_review",
        metadata: {
          matchedQueryKey: input.matchedQueryKey ?? null,
          conflicts: input.extraction.conflicts,
          classType: input.classification.classType
        }
      });
    }

    if (input.llmGate.shouldUseLlm) {
      await this.repository.createAuditEvent({
        userId: input.userId,
        eventType: "gmail_llm_fallback_used",
        metadata: {
          matchedQueryKey: input.matchedQueryKey ?? null,
          executed: false,
          reasons: input.llmGate.reasons
        }
      });
    }

    if (input.routing.action === "SUPPRESS") {
      await this.repository.createAuditEvent({
        userId: input.userId,
        eventType: "gmail_suppressed",
        metadata: {
          matchedQueryKey: input.matchedQueryKey ?? null,
          reason: input.routing.reason,
          classType: input.classification.classType
        }
      });
    }
  }
}

function toLifecycleHintFromQuery(
  matchedQueryKey: string | undefined
): "WELCOME" | "RENEWAL" | "RECEIPT" | "CANCELLATION" | "BILLING" | "STATEMENT" | undefined {
  if (matchedQueryKey === "subscription_welcome") return "WELCOME";
  if (matchedQueryKey === "subscription_renewal") return "RENEWAL";
  if (matchedQueryKey === "subscription_cancellation") return "CANCELLATION";
  if (matchedQueryKey === "billing_due") return "BILLING";
  if (matchedQueryKey === "recurring_receipt") return "RECEIPT";
  return undefined;
}

function toExpectedCategoryFromQuery(matchedQueryKey: string | undefined): VendorCategory | null {
  if (
    matchedQueryKey === "subscription_welcome" ||
    matchedQueryKey === "subscription_renewal" ||
    matchedQueryKey === "subscription_cancellation"
  ) {
    return "SUBSCRIPTION";
  }
  if (matchedQueryKey === "billing_due") return "BANK";
  return null;
}
