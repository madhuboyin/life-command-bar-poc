import { LlmTaskType } from "@prisma/client";
import { z } from "zod";
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
import { LlmGatewayService, type LlmGatewayResult } from "./llm-gateway.service";
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

const gmailLlmExtractionSchema = z.object({
  lifecycleEmailType: z
    .enum(["WELCOME", "RENEWAL", "RECEIPT", "CANCELLATION", "UNKNOWN"])
    .optional()
    .nullable(),
  vendor: z.string().trim().min(1).max(140).optional().nullable(),
  planName: z.string().trim().min(1).max(140).optional().nullable(),
  introPrice: z.number().finite().nonnegative().optional().nullable(),
  recurringPrice: z.number().finite().nonnegative().optional().nullable(),
  amountCharged: z.number().finite().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).optional().nullable(),
  billingPeriod: z.enum(["MONTHLY", "YEARLY", "QUARTERLY", "UNKNOWN"]).optional().nullable(),
  trialEndDate: z.string().datetime().optional().nullable(),
  renewalDate: z.string().datetime().optional().nullable(),
  receiptDate: z.string().datetime().optional().nullable(),
  cancellationEffectiveDate: z.string().datetime().optional().nullable(),
  autoRenewStatus: z.enum(["ON", "OFF", "UNKNOWN"]).optional().nullable(),
  confidenceDelta: z.number().min(-0.25).max(0.25).optional().nullable(),
  rationale: z.array(z.string().min(1).max(80)).max(12).optional().default([])
});

type GmailLlmExtraction = z.infer<typeof gmailLlmExtractionSchema>;

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
  llmExecution: {
    status: string;
    resolvedBy: string;
    modelTier: string;
    modelKey: string;
    cacheHit: boolean;
    reasons: string[];
    usageRecordId: string | null;
  } | null;
  routing: GmailRoutingDecision;
  extractionConflicts: string[];
  extractionRationale: string[];
};

export class GmailIntelligenceService {
  private readonly repository = new ExternalAccountRepository();
  private readonly vendorIntelligenceService = new VendorIntelligenceService();
  private readonly llmGateway = new LlmGatewayService();

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

    const initialClassification = classifyGmailMessageV2({
      subject: input.subject,
      bodyText: input.bodyText,
      snippet: input.snippet,
      matchedQueryKey: input.matchedQueryKey,
      vendorMatch: vendorResolution.match
    });

    const initialExtractionV2 = extractGmailFieldsV2({
      classification: initialClassification,
      vendorMatch: vendorResolution.match,
      subject: input.subject,
      from: input.from,
      bodyText: input.bodyText,
      snippet: input.snippet,
      messageDate: input.messageDate
    });

    const llmGate = evaluateGmailLlmGate({
      classification: initialClassification,
      extraction: initialExtractionV2,
      vendorMatch: vendorResolution.match,
      bodyText: input.bodyText
    });

    const llmFallback = await this.runLlmFallback({
      userId: input.userId,
      matchedQueryKey: input.matchedQueryKey,
      subject: input.subject,
      from: input.from,
      bodyText: input.bodyText,
      snippet: input.snippet,
      messageDate: input.messageDate,
      initialClassification,
      initialExtractionV2,
      vendorResolution,
      llmGate
    });

    const classification = llmFallback.classification;
    const extractionV2 = llmFallback.extractionV2;
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
      llmExecution: llmFallback.llmResult,
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
        llmExecution: llmFallback.llmResult
          ? {
              status: llmFallback.llmResult.status,
              resolvedBy: llmFallback.llmResult.resolvedBy,
              modelTier: llmFallback.llmResult.route.modelTier,
              modelKey: llmFallback.llmResult.route.modelKey,
              cacheHit: llmFallback.llmResult.cache.hit,
              reasons: llmFallback.llmResult.reasons,
              usageRecordId: llmFallback.llmResult.usageRecordId
            }
          : null,
        routing,
        extractionConflicts: extractionV2.conflicts,
        extractionRationale: extractionV2.rationale
      }
    };
  }

  private async runLlmFallback(input: {
    userId: string;
    matchedQueryKey?: string;
    subject: string;
    from: string;
    bodyText: string;
    snippet: string;
    messageDate: string | null;
    initialClassification: GmailClassifierV2Result;
    initialExtractionV2: GmailFieldExtractionV2Result;
    vendorResolution: Awaited<ReturnType<VendorIntelligenceService["resolveVendorIdentity"]>>;
    llmGate: GmailLlmGateResult;
  }): Promise<{
    classification: GmailClassifierV2Result;
    extractionV2: GmailFieldExtractionV2Result;
    llmResult: LlmGatewayResult<GmailLlmExtraction> | null;
  }> {
    if (!input.llmGate.shouldUseLlm) {
      return {
        classification: input.initialClassification,
        extractionV2: input.initialExtractionV2,
        llmResult: null
      };
    }

    const taskType = input.llmGate.reasons.includes("vendor_conflict")
      ? LlmTaskType.GMAIL_LIFECYCLE_CONFLICT_RESOLUTION
      : LlmTaskType.GMAIL_COMPLEX_EXTRACTION;

    const llmResult = await this.llmGateway.execute<GmailLlmExtraction>({
      userId: input.userId,
      taskType,
      deterministicGate: {
        shouldCallLlm: input.llmGate.shouldUseLlm,
        reason: input.llmGate.reasons.join(",")
      },
      input: {
        matchedQueryKey: input.matchedQueryKey ?? null,
        subject: input.subject,
        from: input.from,
        bodyText: input.bodyText,
        snippet: input.snippet,
        messageDate: input.messageDate,
        classifier: {
          classType: input.initialClassification.classType,
          lifecycleEmailType: input.initialClassification.lifecycleEmailType,
          classConfidence: input.initialClassification.classConfidence
        },
        extraction: input.initialExtractionV2.extraction,
        extractionConflicts: input.initialExtractionV2.conflicts,
        vendor: {
          outcome: input.vendorResolution.match.outcome,
          vendorKey: input.vendorResolution.match.vendorKey,
          canonicalName: input.vendorResolution.match.canonicalName,
          category: input.vendorResolution.match.category
        }
      },
      schema: gmailLlmExtractionSchema,
      outputContract: {
        lifecycleEmailType: "WELCOME|RENEWAL|RECEIPT|CANCELLATION|UNKNOWN",
        vendor: "string|null",
        planName: "string|null",
        introPrice: "number|null",
        recurringPrice: "number|null",
        amountCharged: "number|null",
        currency: "ISO3|null",
        billingPeriod: "MONTHLY|YEARLY|QUARTERLY|UNKNOWN|null",
        trialEndDate: "ISO datetime|null",
        renewalDate: "ISO datetime|null",
        receiptDate: "ISO datetime|null",
        cancellationEffectiveDate: "ISO datetime|null",
        autoRenewStatus: "ON|OFF|UNKNOWN|null",
        confidenceDelta: "number -0.25..0.25",
        rationale: "string[]"
      },
      instructions:
        "Resolve only ambiguous lifecycle/pricing fields for subscription or billing emails. Keep null for uncertain fields.",
      parserVersion: "gmail-llm-v1",
      promptVersion: "gmail-llm-v1",
      complexityScore: Math.min(1, 0.42 + input.initialExtractionV2.conflicts.length * 0.2),
      businessImpact: "MEDIUM",
      templateHint: [
        input.vendorResolution.match.vendorKey ?? "unknown_vendor",
        input.initialClassification.classType
      ].join(":"),
      metadata: {
        source: "gmail_intelligence_v2",
        reasons: input.llmGate.reasons,
        classType: input.initialClassification.classType
      }
    });

    if (!llmResult.output || llmResult.status === "FAILED") {
      return {
        classification: input.initialClassification,
        extractionV2: input.initialExtractionV2,
        llmResult
      };
    }

    const merged = applyGmailLlmOutput({
      classification: input.initialClassification,
      extractionV2: input.initialExtractionV2,
      llm: llmResult.output
    });

    return {
      classification: merged.classification,
      extractionV2: merged.extractionV2,
      llmResult
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
    llmExecution: LlmGatewayResult<GmailLlmExtraction> | null;
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
          executed: input.llmExecution !== null,
          reasons: input.llmGate.reasons,
          llmStatus: input.llmExecution?.status ?? "not_called",
          resolvedBy: input.llmExecution?.resolvedBy ?? null,
          modelTier: input.llmExecution?.route.modelTier ?? null,
          modelKey: input.llmExecution?.route.modelKey ?? null,
          cacheHit: input.llmExecution?.cache.hit ?? null,
          usageRecordId: input.llmExecution?.usageRecordId ?? null
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

function applyGmailLlmOutput(input: {
  classification: GmailClassifierV2Result;
  extractionV2: GmailFieldExtractionV2Result;
  llm: GmailLlmExtraction;
}): {
  classification: GmailClassifierV2Result;
  extractionV2: GmailFieldExtractionV2Result;
} {
  const classification = {
    ...input.classification,
    rationaleSignals: [...input.classification.rationaleSignals],
    cautionSignals: [...input.classification.cautionSignals],
    classScores: { ...input.classification.classScores }
  };

  if (
    classification.lifecycleEmailType === "UNKNOWN" &&
    input.llm.lifecycleEmailType &&
    input.llm.lifecycleEmailType !== "UNKNOWN"
  ) {
    classification.lifecycleEmailType = input.llm.lifecycleEmailType;
    classification.classType = toClassTypeFromLifecycle(input.llm.lifecycleEmailType);
    classification.classConfidence = clampScore(Math.max(classification.classConfidence, 0.58));
    classification.subscriptionLikelihood = clampScore(
      Math.max(classification.subscriptionLikelihood, 0.56)
    );
    classification.rationaleSignals = unique([
      ...classification.rationaleSignals,
      "llm_lifecycle_override_unknown"
    ]);
  } else if (
    input.llm.lifecycleEmailType &&
    input.llm.lifecycleEmailType !== "UNKNOWN" &&
    input.llm.lifecycleEmailType !== classification.lifecycleEmailType
  ) {
    classification.cautionSignals = unique([
      ...classification.cautionSignals,
      "llm_lifecycle_conflict"
    ]);
  }

  if (input.llm.confidenceDelta !== null && input.llm.confidenceDelta !== undefined) {
    classification.classConfidence = clampScore(classification.classConfidence + input.llm.confidenceDelta);
    classification.subscriptionLikelihood = clampScore(
      classification.subscriptionLikelihood + input.llm.confidenceDelta * 0.7
    );
  }

  const extraction = { ...input.extractionV2.extraction };
  if (!extraction.vendor && input.llm.vendor) extraction.vendor = sanitizeLabel(input.llm.vendor);
  if (!extraction.planName && input.llm.planName) extraction.planName = sanitizeLabel(input.llm.planName);
  if (extraction.introPrice === null && input.llm.introPrice !== null && input.llm.introPrice !== undefined) {
    extraction.introPrice = roundMoney(input.llm.introPrice);
  }
  if (
    extraction.recurringPrice === null &&
    input.llm.recurringPrice !== null &&
    input.llm.recurringPrice !== undefined
  ) {
    extraction.recurringPrice = roundMoney(input.llm.recurringPrice);
  }
  if (
    extraction.amountCharged === null &&
    input.llm.amountCharged !== null &&
    input.llm.amountCharged !== undefined
  ) {
    extraction.amountCharged = roundMoney(input.llm.amountCharged);
  }
  if (!extraction.currency && input.llm.currency) extraction.currency = input.llm.currency.toUpperCase();
  if (
    extraction.billingPeriod === "UNKNOWN" &&
    input.llm.billingPeriod &&
    input.llm.billingPeriod !== "UNKNOWN"
  ) {
    extraction.billingPeriod = input.llm.billingPeriod;
  }
  if (!extraction.trialEndDate && input.llm.trialEndDate) extraction.trialEndDate = input.llm.trialEndDate;
  if (!extraction.renewalDate && input.llm.renewalDate) extraction.renewalDate = input.llm.renewalDate;
  if (!extraction.receiptDate && input.llm.receiptDate) extraction.receiptDate = input.llm.receiptDate;
  if (!extraction.cancellationEffectiveDate && input.llm.cancellationEffectiveDate) {
    extraction.cancellationEffectiveDate = input.llm.cancellationEffectiveDate;
  }
  if (
    extraction.autoRenewStatus === "UNKNOWN" &&
    input.llm.autoRenewStatus &&
    input.llm.autoRenewStatus !== "UNKNOWN"
  ) {
    extraction.autoRenewStatus = input.llm.autoRenewStatus;
  }

  extraction.extractionSignals = unique([
    ...extraction.extractionSignals,
    ...(input.llm.rationale ?? []).map((entry) => `llm:${entry}`),
    "llm_enrichment_applied"
  ]);

  const mergedConflicts = [...input.extractionV2.conflicts];
  if (
    input.llm.recurringPrice !== null &&
    input.llm.recurringPrice !== undefined &&
    input.extractionV2.extraction.recurringPrice !== null &&
    Math.abs(input.extractionV2.extraction.recurringPrice - input.llm.recurringPrice) > 0.01
  ) {
    mergedConflicts.push("llm_recurring_price_conflict");
  }

  return {
    classification,
    extractionV2: {
      ...input.extractionV2,
      extraction,
      conflicts: unique(mergedConflicts),
      rationale: unique([
        ...input.extractionV2.rationale,
        ...(input.llm.rationale ?? []).map((entry) => `llm:${entry}`)
      ]),
      quality: {
        hasStructuredPrice:
          extraction.recurringPrice !== null ||
          extraction.amountCharged !== null ||
          extraction.introPrice !== null,
        hasLifecycleDate:
          Boolean(extraction.renewalDate) ||
          Boolean(extraction.cancellationEffectiveDate) ||
          Boolean(extraction.receiptDate) ||
          Boolean(extraction.trialEndDate),
        hasVendor: Boolean(extraction.vendor),
        hasPlan: Boolean(extraction.planName),
        sourceQualityPenalty: input.extractionV2.quality.sourceQualityPenalty
      }
    }
  };
}

function toClassTypeFromLifecycle(
  lifecycleEmailType: "WELCOME" | "RENEWAL" | "RECEIPT" | "CANCELLATION" | "UNKNOWN"
): GmailClassifierV2Result["classType"] {
  if (lifecycleEmailType === "WELCOME") return "SUBSCRIPTION_WELCOME";
  if (lifecycleEmailType === "RENEWAL") return "SUBSCRIPTION_RENEWAL";
  if (lifecycleEmailType === "RECEIPT") return "SUBSCRIPTION_RECEIPT";
  if (lifecycleEmailType === "CANCELLATION") return "SUBSCRIPTION_CANCELLATION";
  return "UNKNOWN";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sanitizeLabel(value: string) {
  return value.trim().slice(0, 140);
}
