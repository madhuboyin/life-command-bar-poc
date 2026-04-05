import {
  MemoryEventSourceType,
  Prisma,
  ScopeType,
  SubscriptionAutoRenewStatus,
  SubscriptionBillingPeriod,
  SubscriptionConfidenceBand,
  SubscriptionEvidenceReferenceType,
  SubscriptionEvidenceSourceSubtype,
  SubscriptionEvidenceSourceType,
  SubscriptionLifecycleEventType,
  SubscriptionLifecycleState
} from "@prisma/client";
import { z } from "zod";
import { SubscriptionRegistryRepository } from "../repositories/subscription-registry.repository";
import {
  normalizeVendorKey,
  pickBestSubscriptionMatch
} from "./subscription-matcher";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { SubscriptionPricingService } from "./subscription-pricing.service";
import { SubscriptionMergeService } from "./subscription-merge.service";
import { listActiveHouseholdIdsForUser } from "../utils/household-access";
import type { GmailSubscriptionHeuristicResult } from "./gmail-subscription-heuristics";
import { HomeMemoryService } from "./home-memory.service";
import { PredictionEngineService } from "./prediction-engine.service";
import { AppError } from "../utils/app-error";
import { SubscriptionInsightService } from "./subscription-insight.service";
import { buildSubscriptionGuidedFlow } from "./subscription-guided-flow";
import { SubscriptionDecisionEngine } from "./subscription-decision-engine";
import { VendorIntelligenceService } from "./vendor-intelligence.service";
import { LlmCacheService } from "./llm-cache.service";
import type { VendorCategory } from "./vendor-profiles";

const listQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
  lifecycleState: z
    .enum([
      "DISCOVERED",
      "TRIALING",
      "ACTIVE",
      "RENEWING",
      "PRICE_CHANGED",
      "CANCELING",
      "CANCELED",
      "ENDED",
      "INACTIVE",
      "UNKNOWN"
    ])
    .optional()
});

const patchSchema = z.object({
  vendorName: z.string().min(1).optional(),
  planName: z.string().nullable().optional(),
  subscriptionTitle: z.string().min(1).optional(),
  scopeType: z.enum(["PERSONAL", "HOUSEHOLD"]).optional(),
  householdId: z.string().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  createdByUserId: z.string().nullable().optional(),
  lastHandledByUserId: z.string().nullable().optional(),
  lifecycleState: z
    .enum([
      "DISCOVERED",
      "TRIALING",
      "ACTIVE",
      "RENEWING",
      "PRICE_CHANGED",
      "CANCELING",
      "CANCELED",
      "ENDED",
      "INACTIVE",
      "UNKNOWN"
    ])
    .optional(),
  billingPeriod: z.enum(["MONTHLY", "YEARLY", "QUARTERLY", "WEEKLY", "UNKNOWN"]).optional(),
  recurringPrice: z.number().nullable().optional(),
  introPrice: z.number().nullable().optional(),
  amountLastCharged: z.number().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  autoRenewStatus: z.enum(["ON", "OFF", "UNKNOWN"]).optional(),
  trialEndDate: z.string().nullable().optional(),
  nextRenewalDate: z.string().nullable().optional(),
  lastChargedDate: z.string().nullable().optional(),
  cancellationEffectiveDate: z.string().nullable().optional(),
  category: z.string().nullable().optional()
});

const mergeSchema = z.object({
  primarySubscriptionId: z.string().min(1),
  duplicateSubscriptionId: z.string().min(1)
});

type GmailRegistryInput = {
  userId: string;
  lifecycle: GmailSubscriptionHeuristicResult;
  provenance: {
    externalConnectionId: string;
    externalMessageId: string;
    matchedQueryKey: string;
    sender: string;
    subject: string;
    messageDate: string | null;
    importSourceId: string | null;
    obligationId: string | null;
  };
};

export class SubscriptionRegistryService {
  private readonly repository = new SubscriptionRegistryRepository();
  private readonly lifecycleService = new SubscriptionLifecycleService();
  private readonly pricingService = new SubscriptionPricingService();
  private readonly mergeService = new SubscriptionMergeService();
  private readonly homeMemoryService = new HomeMemoryService();
  private readonly predictionEngineService = new PredictionEngineService();
  private readonly insightService = new SubscriptionInsightService();
  private readonly decisionEngine = new SubscriptionDecisionEngine();
  private readonly vendorIntelligenceService = new VendorIntelligenceService();
  private readonly llmCacheService = new LlmCacheService();

  async list(userId: string, rawQuery: unknown) {
    const query = listQuerySchema.parse(rawQuery ?? {});
    const householdIds = await listActiveHouseholdIdsForUser(userId);
    const data = await this.repository.listForUser({
      userId,
      householdIds,
      lifecycleState: query.lifecycleState as SubscriptionLifecycleState | undefined,
      limit: query.limit,
      offset: query.offset
    });
    const optimization = await this.insightService.refreshForSubscriptions(
      userId,
      data.items.map((item) => item.id),
      { emitEvents: false }
    );

    return {
      items: data.items.map((item) =>
        mapSubscriptionSummary(item, optimization.get(item.id) ?? null)
      ),
      pagination: {
        total: data.total,
        limit: query.limit,
        offset: query.offset
      }
    };
  }

  async getById(userId: string, id: string) {
    const householdIds = await listActiveHouseholdIdsForUser(userId);
    const subscription = await this.repository.findByIdForUser({
      id,
      userId,
      householdIds
    });
    if (!subscription) return null;
    const optimization = await this.insightService.refreshForSubscriptions(userId, [id], {
      emitEvents: false
    });
    return {
      subscription: mapSubscriptionDetail(subscription, optimization.get(id) ?? null)
    };
  }

  async patch(userId: string, id: string, payload: unknown) {
    const input = patchSchema.parse(payload ?? {});
    const existing = await this.repository.findForUserStrict(id, userId);
    if (!existing) return null;

    const changedFields = Object.keys(input);
    if (changedFields.length === 0) {
      return this.getById(userId, id);
    }

    const nextVendorName = input.vendorName ?? existing.vendorName;
    const updateData: Prisma.SubscriptionRegistryUncheckedUpdateInput = {
      vendorName: nextVendorName,
      vendorNormalizedKey: normalizeVendorKey(nextVendorName),
      planName: normalizeNullableString(input.planName, existing.planName),
      subscriptionTitle: input.subscriptionTitle ?? existing.subscriptionTitle,
      scopeType: input.scopeType,
      householdId:
        input.scopeType === ScopeType.PERSONAL
          ? null
          : input.householdId === undefined
            ? existing.householdId
            : input.householdId,
      assignedToUserId: input.assignedToUserId,
      createdByUserId: input.createdByUserId,
      lastHandledByUserId: input.lastHandledByUserId ?? userId,
      lifecycleState: input.lifecycleState as SubscriptionLifecycleState | undefined,
      billingPeriod: input.billingPeriod as SubscriptionBillingPeriod | undefined,
      recurringPrice: input.recurringPrice,
      introPrice: input.introPrice,
      amountLastCharged: input.amountLastCharged,
      currency: input.currency?.toUpperCase() ?? input.currency,
      autoRenewStatus: input.autoRenewStatus as SubscriptionAutoRenewStatus | undefined,
      trialEndDate: parseDateOrNull(input.trialEndDate),
      nextRenewalDate: parseDateOrNull(input.nextRenewalDate),
      lastChargedDate: parseDateOrNull(input.lastChargedDate),
      cancellationEffectiveDate: parseDateOrNull(input.cancellationEffectiveDate),
      category: normalizeNullableString(input.category, existing.category)
    };

    const updated = await this.repository.updateSubscription(id, updateData);
    await this.repository.createLifecycleEvent({
      subscriptionId: id,
      eventType: SubscriptionLifecycleEventType.CORRECTED,
      previousState: existing.lifecycleState,
      nextState: updated.lifecycleState,
      eventDate: new Date(),
      metadata: {
        changedFields
      }
    });

    await this.repository.createAuditEvent({
      userId,
      eventType: "subscription_registry_updated",
      metadata: {
        subscriptionId: id,
        changedFields
      }
    });

    await this.captureDownstreamSignals({
      userId,
      subscriptionId: id,
      eventType: "subscription_registry_review_confirmed",
      rebuild: true
    });
    await this.insightService.refreshForSubscriptions(userId, [id], {
      emitEvents: true
    });
    await this.invalidateLlmCaches(userId, updated.householdId ?? null, "subscription_registry_patch");

    return this.getById(userId, id);
  }

  async merge(userId: string, payload: unknown) {
    const input = mergeSchema.parse(payload ?? {});
    if (input.primarySubscriptionId === input.duplicateSubscriptionId) {
      throw new AppError("VALIDATION_ERROR", "Cannot merge a subscription into itself", 400);
    }

    const primary = await this.repository.findForUserStrict(input.primarySubscriptionId, userId);
    const duplicate = await this.repository.findForUserStrict(input.duplicateSubscriptionId, userId);

    if (!primary || !duplicate) {
      return null;
    }

    const mergedState = this.mergeService.mergeState(
      {
        id: primary.id,
        subscriptionTitle: primary.subscriptionTitle,
        planName: primary.planName,
        recurringPrice: decimalToNumber(primary.recurringPrice),
        currency: primary.currency,
        nextRenewalDate: primary.nextRenewalDate,
        lifecycleState: primary.lifecycleState,
        sourceConfidenceScore: Number(primary.sourceConfidenceScore),
        sourceConfidenceBand: primary.sourceConfidenceBand
      },
      {
        id: duplicate.id,
        subscriptionTitle: duplicate.subscriptionTitle,
        planName: duplicate.planName,
        recurringPrice: decimalToNumber(duplicate.recurringPrice),
        currency: duplicate.currency,
        nextRenewalDate: duplicate.nextRenewalDate,
        lifecycleState: duplicate.lifecycleState,
        sourceConfidenceScore: Number(duplicate.sourceConfidenceScore),
        sourceConfidenceBand: duplicate.sourceConfidenceBand
      }
    );

    await this.repository.runInTransaction(async (tx) => {
      await this.repository.moveMergeRelations(
        {
          primaryId: primary.id,
          duplicateId: duplicate.id
        },
        tx
      );

      await this.repository.updateSubscription(
        primary.id,
        {
          planName: mergedState.planName,
          subscriptionTitle: mergedState.subscriptionTitle,
          recurringPrice: mergedState.recurringPrice,
          currency: mergedState.currency,
          nextRenewalDate: mergedState.nextRenewalDate,
          lifecycleState: mergedState.lifecycleState,
          sourceConfidenceScore: mergedState.sourceConfidenceScore,
          sourceConfidenceBand: mergedState.sourceConfidenceBand
        },
        tx
      );

      await this.repository.updateSubscription(
        duplicate.id,
        {
          lifecycleState: SubscriptionLifecycleState.INACTIVE,
          lastHandledByUserId: userId
        },
        tx
      );

      await this.repository.createLifecycleEvent(
        {
          subscriptionId: primary.id,
          eventType: SubscriptionLifecycleEventType.MERGED,
          previousState: primary.lifecycleState,
          nextState: mergedState.lifecycleState,
          eventDate: new Date(),
          metadata: {
            mergedFromSubscriptionId: duplicate.id
          }
        },
        tx
      );

      await this.repository.createLifecycleEvent(
        {
          subscriptionId: duplicate.id,
          eventType: SubscriptionLifecycleEventType.MERGED,
          previousState: duplicate.lifecycleState,
          nextState: SubscriptionLifecycleState.INACTIVE,
          eventDate: new Date(),
          metadata: {
            mergedIntoSubscriptionId: primary.id
          }
        },
        tx
      );
    });

    await this.repository.createAuditEvent({
      userId,
      eventType: "subscription_registry_merged",
      metadata: {
        primarySubscriptionId: primary.id,
        duplicateSubscriptionId: duplicate.id
      }
    });

    await this.captureDownstreamSignals({
      userId,
      subscriptionId: primary.id,
      eventType: "subscription_registry_updated",
      rebuild: true
    });
    await this.insightService.refreshForSubscriptions(
      userId,
      [primary.id, duplicate.id],
      { emitEvents: true }
    );
    await this.invalidateLlmCaches(
      userId,
      primary.householdId ?? duplicate.householdId ?? null,
      "subscription_registry_merge"
    );

    return this.getById(userId, primary.id);
  }

  async ingestFromGmail(input: GmailRegistryInput) {
    const lifecycle = input.lifecycle;
    if (lifecycle.lifecycleEmailType === "UNKNOWN") {
      return null;
    }

    const confidenceScore = lifecycle.confidence.confidenceScore;
    const vendorIdentity = await this.vendorIntelligenceService.resolveVendorIdentity({
      userId: input.userId,
      candidateVendorName: lifecycle.extraction.vendor,
      sender: input.provenance.sender,
      subject: input.provenance.subject,
      bodyText: "",
      snippet: null,
      lifecycleTypeHint: toVendorLifecycleHint(lifecycle.lifecycleEmailType),
      expectedCategoryHint: toExpectedVendorCategory(lifecycle.lifecycleEmailType),
      source: "subscription_registry_gmail_ingest",
      referenceId: input.provenance.externalMessageId,
      emitAudit: false
    });

    const vendorName = normalizeNullableString(
      vendorIdentity.vendorName,
      resolveVendorName(lifecycle.extraction.vendor, input.provenance.sender)
    );
    if (!vendorName) {
      return null;
    }

    if (!isSubscriptionCompatibleVendorCategory(vendorIdentity.vendorCategory)) {
      await this.repository.createAuditEvent({
        userId: input.userId,
        obligationId: input.provenance.obligationId ?? null,
        eventType: "subscription_registry_update_skipped",
        metadata: {
          reason: "vendor_category_not_subscription_compatible",
          vendorName,
          vendorCategory: vendorIdentity.vendorCategory,
          externalMessageId: input.provenance.externalMessageId
        }
      });
      return null;
    }

    const vendorNormalizedKey =
      vendorIdentity.vendorNormalizedKey ?? normalizeVendorKey(vendorName);
    const normalizedVendorCategory =
      vendorIdentity.vendorCategory === "UNKNOWN" ? null : vendorIdentity.vendorCategory;
    const planName = normalizeNullableString(lifecycle.extraction.planName, null);
    const subscriptionTitle = resolveSubscriptionTitle({
      subscriptionName: lifecycle.extraction.subscriptionName,
      vendorName,
      planName
    });
    const observedAt = parseDateOrNow(input.provenance.messageDate);

    const candidates = await this.repository.findPotentialMatches({
      userId: input.userId,
      vendorNormalizedKey,
      vendorName,
      limit: 20
    });

    const match = pickBestSubscriptionMatch({
      signal: {
        vendorName,
        vendorNormalizedKey,
        planName,
        billingPeriod: toBillingPeriod(lifecycle.extraction.billingPeriod),
        recurringPrice: lifecycle.extraction.recurringPrice,
        amountLastCharged: lifecycle.extraction.amountCharged
      },
      candidates: candidates.map((item) => ({
        id: item.id,
        vendorName: item.vendorName,
        vendorNormalizedKey: item.vendorNormalizedKey,
        planName: item.planName,
        billingPeriod: item.billingPeriod,
        recurringPrice: decimalToNumber(item.recurringPrice),
        amountLastCharged: decimalToNumber(item.amountLastCharged),
        lifecycleState: item.lifecycleState
      }))
    });

    const refType = input.provenance.importSourceId
      ? SubscriptionEvidenceReferenceType.IMPORT_SOURCE
      : SubscriptionEvidenceReferenceType.EXTERNAL_MESSAGE;
    const refId = input.provenance.importSourceId ?? input.provenance.externalMessageId;

    const result = await this.repository.runInTransaction(async (tx) => {
      const current = match
        ? candidates.find((item) => item.id === match.candidate.id) ?? null
        : null;
      const currentPricing = {
        recurringPrice: current ? decimalToNumber(current.recurringPrice) : null,
        introPrice: current ? decimalToNumber(current.introPrice) : null,
        amountLastCharged: current ? decimalToNumber(current.amountLastCharged) : null,
        currency: current?.currency ?? null,
        billingPeriod: current?.billingPeriod ?? SubscriptionBillingPeriod.UNKNOWN
      };
      const pricing = this.pricingService.applySignal({
        current: currentPricing,
        extraction: lifecycle.extraction,
        observedAt
      });

      const transition = this.lifecycleService.determineTransition({
        currentState: current?.lifecycleState ?? null,
        signal: {
          lifecycleEmailType: lifecycle.lifecycleEmailType,
          extraction: lifecycle.extraction
        },
        priceChanged: pricing.priceChanged
      });

      const subscription =
        current ??
        (await this.repository.createSubscription({
          userId: input.userId,
          scopeType: ScopeType.PERSONAL,
          vendorName,
          vendorNormalizedKey,
          planName,
          subscriptionTitle,
          category: normalizedVendorCategory,
          lifecycleState: transition.nextState,
          billingPeriod: pricing.billingPeriod,
          recurringPrice: pricing.recurringPrice,
          introPrice: pricing.introPrice,
          amountLastCharged: pricing.amountLastCharged,
          currency: pricing.currency,
          autoRenewStatus: toAutoRenewStatus(lifecycle.extraction.autoRenewStatus),
          trialEndDate: parseDateOrNull(lifecycle.extraction.trialEndDate),
          nextRenewalDate: parseDateOrNull(lifecycle.extraction.renewalDate),
          lastChargedDate: parseDateOrNull(lifecycle.extraction.receiptDate),
          cancellationEffectiveDate: parseDateOrNull(
            lifecycle.extraction.cancellationEffectiveDate
          ),
          sourceConfidenceScore: confidenceScore,
          sourceConfidenceBand: toConfidenceBand(confidenceScore),
          createdByUserId: input.userId
        }));

      const existingEvidence = await this.repository.findEvidenceByReference(
        {
          subscriptionId: subscription.id,
          referenceType: refType,
          referenceId: refId
        },
        tx
      );

      const evidence =
        existingEvidence ??
        (await this.repository.createEvidence(
          {
            subscriptionId: subscription.id,
            sourceType: SubscriptionEvidenceSourceType.GMAIL,
            sourceSubType: toSourceSubType(lifecycle.lifecycleEmailType),
            referenceType: refType,
            referenceId: refId,
            confidenceScore,
            observedAt,
            signalSummary: {
              externalConnectionId: input.provenance.externalConnectionId,
              externalMessageId: input.provenance.externalMessageId,
              matchedQueryKey: input.provenance.matchedQueryKey,
              sender: input.provenance.sender,
              subject: input.provenance.subject,
              lifecycleEmailType: lifecycle.lifecycleEmailType,
              vendorMatch: {
                outcome: vendorIdentity.match.outcome,
                vendorKey: vendorIdentity.match.vendorKey,
                canonicalName: vendorIdentity.match.canonicalName,
                category: vendorIdentity.match.category,
                score: vendorIdentity.match.score,
                suppressedReason: vendorIdentity.match.suppressedReason,
                signals: vendorIdentity.match.matchedSignals,
                conflicts: vendorIdentity.match.conflicts.map((entry) => ({
                  vendorKey: entry.vendorKey,
                  canonicalName: entry.canonicalName,
                  category: entry.category,
                  score: entry.score
                }))
              },
              vendorRationale: vendorIdentity.rationale,
              extraction: lifecycle.extraction,
              rationaleSignals: lifecycle.confidence.rationaleSignals
            }
          },
          tx
        ));

      const confidenceBand = toConfidenceBand(
        Math.max(confidenceScore, Number(subscription.sourceConfidenceScore))
      );
      const updated = await this.repository.updateSubscription(
        subscription.id,
        {
          vendorName,
          vendorNormalizedKey,
          planName: planName ?? subscription.planName,
          subscriptionTitle,
          category: normalizedVendorCategory ?? subscription.category,
          lifecycleState: transition.nextState,
          billingPeriod: pricing.billingPeriod,
          recurringPrice: pricing.recurringPrice,
          introPrice: pricing.introPrice,
          amountLastCharged: pricing.amountLastCharged,
          currency: pricing.currency,
          autoRenewStatus: toAutoRenewStatus(lifecycle.extraction.autoRenewStatus),
          trialEndDate: parseDateOrNull(lifecycle.extraction.trialEndDate),
          nextRenewalDate: parseDateOrNull(lifecycle.extraction.renewalDate),
          lastChargedDate: parseDateOrNull(lifecycle.extraction.receiptDate),
          cancellationEffectiveDate: parseDateOrNull(
            lifecycle.extraction.cancellationEffectiveDate
          ),
          sourceConfidenceScore: Math.max(confidenceScore, Number(subscription.sourceConfidenceScore)),
          sourceConfidenceBand: confidenceBand,
          lastHandledByUserId: input.userId
        },
        tx
      );

      for (const eventType of transition.eventTypes) {
        await this.repository.createLifecycleEvent(
          {
            subscriptionId: updated.id,
            eventType,
            previousState: transition.previousState,
            nextState: transition.nextState,
            eventDate: observedAt,
            sourceEvidenceId: evidence.id,
            metadata: {
              rationale: transition.rationale,
              matchedQueryKey: input.provenance.matchedQueryKey
            }
          },
          tx
        );
      }

      for (const entry of pricing.historyEntries) {
        await this.repository.createPriceHistory(
          {
            subscriptionId: updated.id,
            priceType: entry.priceType,
            amount: entry.amount,
            currency: entry.currency,
            billingPeriod: entry.billingPeriod,
            effectiveDate: entry.effectiveDate,
            sourceEvidenceId: evidence.id
          },
          tx
        );
      }

      if (input.provenance.obligationId) {
        await this.repository.attachObligationToSubscription(
          {
            obligationId: input.provenance.obligationId,
            userId: input.userId,
            subscriptionId: updated.id
          },
          tx
        );
      }

      return {
        subscriptionId: updated.id,
        created: !current,
        previousState: transition.previousState,
        nextState: transition.nextState,
        priceChanged: pricing.priceChanged
      };
    });

    await this.repository.createAuditEvent({
      userId: input.userId,
      obligationId: input.provenance.obligationId ?? null,
      eventType: result.created
        ? "subscription_registry_created"
        : "subscription_registry_updated",
      metadata: {
        subscriptionId: result.subscriptionId,
        lifecycleEmailType: lifecycle.lifecycleEmailType,
        previousState: result.previousState,
        nextState: result.nextState,
        confidenceScore,
        confidenceBand: toConfidenceBand(confidenceScore),
        matchedQueryKey: input.provenance.matchedQueryKey,
        vendorCategory: vendorIdentity.vendorCategory,
        vendorKey: vendorIdentity.vendorKey,
        vendorMatchScore: vendorIdentity.match.score,
        vendorMatchOutcome: vendorIdentity.match.outcome
      }
    });

    if (input.provenance.obligationId) {
      await this.repository.createAuditEvent({
        userId: input.userId,
        obligationId: input.provenance.obligationId,
        eventType: "subscription_obligation_created",
        metadata: {
          subscriptionId: result.subscriptionId
        }
      });
    }

    await this.repository.createAuditEvent({
      userId: input.userId,
      obligationId: input.provenance.obligationId ?? null,
      eventType: "subscription_lifecycle_transitioned",
      metadata: {
        subscriptionId: result.subscriptionId,
        previousState: result.previousState,
        nextState: result.nextState,
        lifecycleEmailType: lifecycle.lifecycleEmailType
      }
    });

    if (result.priceChanged) {
      await this.repository.createAuditEvent({
        userId: input.userId,
        obligationId: input.provenance.obligationId ?? null,
        eventType: "subscription_price_changed",
        metadata: {
          subscriptionId: result.subscriptionId,
          lifecycleEmailType: lifecycle.lifecycleEmailType
        }
      });
    }

    if (!result.created && result.previousState === result.nextState && !result.priceChanged) {
      await this.repository.createAuditEvent({
        userId: input.userId,
        obligationId: input.provenance.obligationId ?? null,
        eventType: "subscription_prediction_strengthened",
        metadata: {
          subscriptionId: result.subscriptionId,
          lifecycleEmailType: lifecycle.lifecycleEmailType
        }
      });
    }

    if (lifecycle.lifecycleEmailType === "CANCELLATION") {
      await this.repository.createAuditEvent({
        userId: input.userId,
        obligationId: input.provenance.obligationId ?? null,
        eventType: "subscription_cancellation_detected",
        metadata: {
          subscriptionId: result.subscriptionId,
          nextState: result.nextState
        }
      });
    }

    const shouldRebuild =
      result.created ||
      result.previousState !== result.nextState ||
      result.priceChanged;

    await this.captureDownstreamSignals({
      userId: input.userId,
      subscriptionId: result.subscriptionId,
      eventType: "subscription_registry_updated",
      rebuild: shouldRebuild
    });
    await this.insightService.refreshForSubscriptions(
      input.userId,
      [result.subscriptionId],
      { emitEvents: true }
    );
    await this.invalidateLlmCaches(
      input.userId,
      null,
      result.created
        ? "subscription_registry_created"
        : result.priceChanged
          ? "subscription_registry_price_changed"
          : "subscription_registry_state_update"
    );

    return result;
  }

  async getOptimization(userId: string, id: string) {
    const existing = await this.repository.findForUserStrict(id, userId);
    if (!existing) return null;

    const optimization = await this.insightService.refreshForSubscriptions(userId, [id], {
      emitEvents: false
    });
    return optimization.get(id) ?? null;
  }

  async getGuidedReviewFlow(userId: string, id: string) {
    const detail = await this.getById(userId, id);
    if (!detail) return null;

    const optimization = await this.getOptimization(userId, id);
    if (!optimization) return null;

    await this.repository.createAuditEvent({
      userId,
      eventType: "subscription_review_started",
      metadata: {
        subscriptionId: id,
        recommendationType: optimization.recommendation.recommendationType
      }
    });

    return {
      flow: buildSubscriptionGuidedFlow({
        subscription: {
          id: detail.subscription.id,
          subscriptionTitle: detail.subscription.subscriptionTitle,
          vendorName: detail.subscription.vendorName,
          planName: detail.subscription.planName,
          recurringPrice: detail.subscription.recurringPrice,
          currency: detail.subscription.currency,
          nextRenewalDate: detail.subscription.nextRenewalDate,
          lifecycleState: detail.subscription.lifecycleState
        },
        optimization
      }),
      optimization
    };
  }

  async applyDecision(
    userId: string,
    id: string,
    payload: {
      decision: "KEEP" | "CANCEL" | "DOWNGRADE" | "REVIEW" | "REMIND_LATER";
      remindAt?: string | null;
      note?: string | null;
    }
  ) {
    const result = await this.decisionEngine.applyDecision({
      userId,
      subscriptionId: id,
      decision: payload.decision,
      remindAt: payload.remindAt,
      note: payload.note
    });
    await this.invalidateLlmCaches(userId, null, "subscription_decision_applied");
    const subscription = await this.getById(userId, id);
    return {
      result,
      subscription: subscription?.subscription ?? null
    };
  }

  private async captureDownstreamSignals(input: {
    userId: string;
    subscriptionId: string;
    eventType: string;
    rebuild: boolean;
  }) {
    await this.homeMemoryService
      .captureSignal({
        userId: input.userId,
        sourceType: MemoryEventSourceType.INGESTION,
        referenceId: input.subscriptionId,
        eventType: input.eventType,
        metadata: {
          source: "subscription_registry"
        },
        rebuild: input.rebuild
      })
      .catch(() => null);

    if (input.rebuild) {
      await this.predictionEngineService.rebuild(input.userId).catch(() => null);
    }
  }

  private async invalidateLlmCaches(
    userId: string,
    householdId: string | null,
    reason: string
  ) {
    await this.llmCacheService
      .invalidate({
        userId,
        householdId,
        reason
      })
      .catch(() => null);
  }
}

function mapSubscriptionSummary(item: any, optimization: any | null = null) {
  return {
    id: item.id,
    userId: item.userId,
    scopeType: item.scopeType,
    householdId: item.householdId,
    assignedToUserId: item.assignedToUserId,
    createdByUserId: item.createdByUserId,
    lastHandledByUserId: item.lastHandledByUserId,
    assignedTo: item.assignedToUser
      ? {
          id: item.assignedToUser.id,
          email: item.assignedToUser.email,
          name: item.assignedToUser.name
        }
      : null,
    vendorName: item.vendorName,
    vendorNormalizedKey: item.vendorNormalizedKey,
    planName: item.planName,
    subscriptionTitle: item.subscriptionTitle,
    category: item.category,
    lifecycleState: item.lifecycleState,
    billingPeriod: item.billingPeriod,
    recurringPrice: decimalToNumber(item.recurringPrice),
    currency: item.currency,
    introPrice: decimalToNumber(item.introPrice),
    amountLastCharged: decimalToNumber(item.amountLastCharged),
    autoRenewStatus: item.autoRenewStatus,
    trialEndDate: item.trialEndDate?.toISOString() ?? null,
    nextRenewalDate: item.nextRenewalDate?.toISOString() ?? null,
    lastChargedDate: item.lastChargedDate?.toISOString() ?? null,
    cancellationEffectiveDate: item.cancellationEffectiveDate?.toISOString() ?? null,
    sourceConfidenceScore: Number(item.sourceConfidenceScore),
    sourceConfidenceBand: item.sourceConfidenceBand,
    optimization: optimization
      ? {
          health: optimization.health,
          insights: optimization.insights,
          recommendation: optimization.recommendation
        }
      : null,
    counts: {
      evidence: item._count?.evidence ?? 0,
      lifecycleEvents: item._count?.lifecycleEvents ?? 0,
      priceHistory: item._count?.priceHistory ?? 0,
      linkedObligations: item._count?.obligations ?? 0,
      insights: optimization?.insights?.length ?? 0
    },
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function mapSubscriptionDetail(item: any, optimization: any | null = null) {
  return {
    ...mapSubscriptionSummary(item, optimization),
    createdBy: item.createdByUser
      ? {
          id: item.createdByUser.id,
          email: item.createdByUser.email,
          name: item.createdByUser.name
        }
      : null,
    lastHandledBy: item.lastHandledByUser
      ? {
          id: item.lastHandledByUser.id,
          email: item.lastHandledByUser.email,
          name: item.lastHandledByUser.name
        }
      : null,
    evidence: (item.evidence ?? []).map((entry: any) => ({
      id: entry.id,
      sourceType: entry.sourceType,
      sourceSubType: entry.sourceSubType,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      signalSummary: entry.signalSummary,
      confidenceScore: Number(entry.confidenceScore),
      observedAt: entry.observedAt.toISOString(),
      createdAt: entry.createdAt.toISOString()
    })),
    lifecycleEvents: (item.lifecycleEvents ?? []).map((entry: any) => ({
      id: entry.id,
      eventType: entry.eventType,
      previousState: entry.previousState,
      nextState: entry.nextState,
      eventDate: entry.eventDate?.toISOString() ?? null,
      metadata: entry.metadata,
      sourceEvidenceId: entry.sourceEvidenceId ?? null,
      createdAt: entry.createdAt.toISOString()
    })),
    priceHistory: (item.priceHistory ?? []).map((entry: any) => ({
      id: entry.id,
      priceType: entry.priceType,
      amount: Number(entry.amount),
      currency: entry.currency,
      billingPeriod: entry.billingPeriod ?? null,
      effectiveDate: entry.effectiveDate?.toISOString() ?? null,
      sourceEvidenceId: entry.sourceEvidenceId ?? null,
      createdAt: entry.createdAt.toISOString()
    })),
    linkedObligations: (item.obligations ?? []).map((entry: any) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
      type: entry.type,
      dueDate: entry.dueDate?.toISOString() ?? null,
      amount: decimalToNumber(entry.amount),
      currency: entry.currency,
      updatedAt: entry.updatedAt.toISOString()
    }))
  };
}

function resolveVendorName(vendor: string | null, sender: string) {
  const direct = normalizeNullableString(vendor, null);
  if (direct) return direct;

  const from = sender.trim();
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch?.[1]) {
    const value = nameMatch[1].trim();
    if (value.length > 1) return value.slice(0, 80);
  }

  const domainMatch = from.match(/@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (domainMatch?.[1]) {
    const root = domainMatch[1].split(".")[0]?.replace(/[-_]+/g, " ").trim();
    if (root && root.length > 1) {
      return root.slice(0, 80);
    }
  }

  return null;
}

function resolveSubscriptionTitle(input: {
  subscriptionName: string | null;
  vendorName: string;
  planName: string | null;
}) {
  const fromExtraction = normalizeNullableString(input.subscriptionName, null);
  if (fromExtraction) return fromExtraction;
  if (input.planName) return `${input.vendorName} ${input.planName}`.slice(0, 180);
  return `${input.vendorName} Subscription`.slice(0, 180);
}

function toSourceSubType(value: string): SubscriptionEvidenceSourceSubtype | null {
  if (value === "WELCOME") return SubscriptionEvidenceSourceSubtype.WELCOME_EMAIL;
  if (value === "RENEWAL") return SubscriptionEvidenceSourceSubtype.RENEWAL_EMAIL;
  if (value === "RECEIPT") return SubscriptionEvidenceSourceSubtype.RECEIPT_EMAIL;
  if (value === "CANCELLATION") return SubscriptionEvidenceSourceSubtype.CANCELLATION_EMAIL;
  return null;
}

function toAutoRenewStatus(value: string): SubscriptionAutoRenewStatus {
  if (value === "ON") return SubscriptionAutoRenewStatus.ON;
  if (value === "OFF") return SubscriptionAutoRenewStatus.OFF;
  return SubscriptionAutoRenewStatus.UNKNOWN;
}

function toBillingPeriod(value: string): SubscriptionBillingPeriod {
  if (value === "MONTHLY") return SubscriptionBillingPeriod.MONTHLY;
  if (value === "YEARLY") return SubscriptionBillingPeriod.YEARLY;
  if (value === "QUARTERLY") return SubscriptionBillingPeriod.QUARTERLY;
  return SubscriptionBillingPeriod.UNKNOWN;
}

function parseDateOrNull(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError("VALIDATION_ERROR", "Invalid date value", 400, { value });
  }
  return parsed;
}

function parseDateOrNow(value: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function normalizeNullableString(value: string | null | undefined, fallback: string | null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 180);
}

function decimalToNumber(value: Prisma.Decimal | null) {
  return value ? Number(value) : null;
}

function toConfidenceBand(score: number): SubscriptionConfidenceBand {
  if (score >= 0.78) return SubscriptionConfidenceBand.HIGH;
  if (score >= 0.48) return SubscriptionConfidenceBand.MEDIUM;
  return SubscriptionConfidenceBand.LOW;
}

function toVendorLifecycleHint(
  value: string
): "WELCOME" | "RENEWAL" | "RECEIPT" | "CANCELLATION" | "BILLING" | "STATEMENT" {
  if (value === "WELCOME") return "WELCOME";
  if (value === "RENEWAL") return "RENEWAL";
  if (value === "RECEIPT") return "RECEIPT";
  if (value === "CANCELLATION") return "CANCELLATION";
  return "RECEIPT";
}

function toExpectedVendorCategory(value: string): VendorCategory | null {
  if (value === "WELCOME" || value === "RENEWAL" || value === "CANCELLATION") {
    return "SUBSCRIPTION";
  }
  return null;
}

function isSubscriptionCompatibleVendorCategory(category: VendorCategory) {
  return (
    category === "SUBSCRIPTION" ||
    category === "SOFTWARE" ||
    category === "TELECOM" ||
    category === "RETAIL" ||
    category === "UNKNOWN"
  );
}
