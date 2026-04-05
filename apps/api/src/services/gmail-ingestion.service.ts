import { Prisma } from "@prisma/client";
import { ExternalAccountRepository } from "../repositories/external-account.repository";
import { IngestionResult, IngestionService } from "./ingestion.service";
import {
  NormalizedGmailMessage
} from "./gmail-message-normalizer";
import { GmailDedupeService } from "./gmail-dedupe.service";
import { runGmailSubscriptionHeuristics, GmailSubscriptionHeuristicResult } from "./gmail-subscription-heuristics";
import { SubscriptionRegistryService } from "./subscription-registry.service";

export type GmailMessageIngestionResult = {
  skippedAsExactDuplicate: boolean;
  messageRecordId: string | null;
  ingestion: IngestionResult | null;
};

export class GmailIngestionService {
  private readonly externalAccountRepository = new ExternalAccountRepository();
  private readonly ingestionService = new IngestionService();
  private readonly dedupeService = new GmailDedupeService();
  private readonly subscriptionRegistryService = new SubscriptionRegistryService();

  async ingestMessage(input: {
    userId: string;
    externalConnectionId: string;
    matchedQueryKey: string;
    normalizedMessage: NormalizedGmailMessage;
  }): Promise<GmailMessageIngestionResult> {
    const connection = await this.externalAccountRepository.getGmailConnectionForUser(input.userId);
    
    const lifecycle = await runGmailSubscriptionHeuristics({
      userId: input.userId,
      subject: input.normalizedMessage.subject,
      from: input.normalizedMessage.from,
      bodyText: input.normalizedMessage.bodyText,
      snippet: input.normalizedMessage.snippet,
      messageDate: input.normalizedMessage.messageDate,
      matchedQueryKey: input.matchedQueryKey
    });

    await this.externalAccountRepository.createAuditEvent({
      userId: input.userId,
      eventType: "gmail_subscription_lifecycle_detected",
      metadata: {
        externalConnectionId: input.externalConnectionId,
        gmailMessageId: input.normalizedMessage.gmailMessageId,
        gmailThreadId: input.normalizedMessage.gmailThreadId,
        matchedQueryKey: input.matchedQueryKey,
        lifecycleEmailType: lifecycle.lifecycleEmailType,
        subscriptionLikelihood: lifecycle.classification.subscriptionLikelihood,
        classConfidence: lifecycle.classification.classConfidence,
        confidenceScore: lifecycle.confidence.confidenceScore,
        confidenceBand: lifecycle.confidence.confidenceBand,
        rationaleSignals: lifecycle.confidence.rationaleSignals,
        reviewReasons: lifecycle.confidence.reviewReasons
      }
    });

    const existing = await this.externalAccountRepository.findMessageIngestion(
      input.externalConnectionId,
      input.normalizedMessage.gmailMessageId
    );
    
    if (
      connection &&
      !connection.includeRecurringReceipts &&
      lifecycle.lifecycleEmailType === "RECEIPT" &&
      input.matchedQueryKey === "recurring_receipt"
    ) {
      await this.externalAccountRepository.createAuditEvent({
        userId: input.userId,
        eventType: "gmail_candidate_skipped",
        metadata: {
          externalConnectionId: input.externalConnectionId,
          gmailMessageId: input.normalizedMessage.gmailMessageId,
          matchedQueryKey: input.matchedQueryKey,
          reason: "user_preference_opt_out"
        }
      });

      return {
        skippedAsExactDuplicate: false,
        messageRecordId: null,
        ingestion: null
      };
    }

    if (existing) {
      await this.externalAccountRepository.createAuditEvent({
        userId: input.userId,
        obligationId: existing.obligationId,
        eventType: "gmail_duplicate_suppressed",
        metadata: {
          externalConnectionId: input.externalConnectionId,
          gmailMessageId: input.normalizedMessage.gmailMessageId,
          reason: "already_processed"
        }
      });

      return {
        skippedAsExactDuplicate: true,
        messageRecordId: existing.id,
        ingestion: null
      };
    }

    const ingestion = await this.ingestionService.ingestGmailReadonly({
      userId: input.userId,
      externalConnectionId: input.externalConnectionId,
      gmailMessageId: input.normalizedMessage.gmailMessageId,
      gmailThreadId: input.normalizedMessage.gmailThreadId,
      matchedQueryKey: input.matchedQueryKey,
      historyId: input.normalizedMessage.historyId,
      from: input.normalizedMessage.from,
      subject: input.normalizedMessage.subject,
      bodyText: input.normalizedMessage.bodyText,
      snippet: input.normalizedMessage.snippet,
      labelIds: input.normalizedMessage.labelIds,
      messageDate: input.normalizedMessage.messageDate,
      internalDate: input.normalizedMessage.internalDate,
      subscriptionLifecycle: lifecycle
    });

    const messageStatus = this.dedupeService.toMessageStatus(ingestion, lifecycle.vendorHistory?.hasRejectedHistory);
    const dedupeReason = this.dedupeService.buildReason(ingestion, lifecycle.vendorHistory?.hasRejectedHistory);

    const messageDate = input.normalizedMessage.messageDate
      ? new Date(input.normalizedMessage.messageDate)
      : null;
    const internalDate = input.normalizedMessage.internalDate
      ? new Date(input.normalizedMessage.internalDate)
      : null;

    try {
      const record = await this.externalAccountRepository.createMessageIngestion({
        userId: input.userId,
        externalConnectionId: input.externalConnectionId,
        externalMessageId: input.normalizedMessage.gmailMessageId,
        externalThreadId: input.normalizedMessage.gmailThreadId,
        messageDate,
        messageInternalDate: internalDate,
        matchedQueryKey: input.matchedQueryKey,
        importSourceId: ingestion.importSourceId,
        obligationId: ingestion.obligationId,
        status: messageStatus,
        dedupeReason,
        metadata: {
          from: input.normalizedMessage.from,
          subject: input.normalizedMessage.subject,
          confidence: ingestion.confidence,
          confidenceBand: ingestion.confidenceBand,
          needsReview: ingestion.needsReview,
          status: ingestion.status,
          lifecycleEmailType: lifecycle.lifecycleEmailType,
          subscriptionLikelihood: lifecycle.classification.subscriptionLikelihood,
          lifecycleConfidence: lifecycle.confidence.confidenceScore,
          lifecycleConfidenceBand: lifecycle.confidence.confidenceBand
        }
      });

      await this.emitIngestionAuditEvents(input, ingestion, dedupeReason, lifecycle);

      if (lifecycle.lifecycleEmailType !== "UNKNOWN") {
        const registryResult = await this.subscriptionRegistryService
          .ingestFromGmail({
            userId: input.userId,
            lifecycle,
            provenance: {
              externalConnectionId: input.externalConnectionId,
              externalMessageId: input.normalizedMessage.gmailMessageId,
              matchedQueryKey: input.matchedQueryKey,
              sender: input.normalizedMessage.from,
              subject: input.normalizedMessage.subject,
              messageDate: input.normalizedMessage.messageDate,
              importSourceId: ingestion.importSourceId,
              obligationId: ingestion.obligationId
            }
          })
          .catch(async (registryError) => {
            await this.externalAccountRepository.createAuditEvent({
              userId: input.userId,
              obligationId: ingestion.obligationId,
              eventType: "gmail_sync_error",
              metadata: {
                externalConnectionId: input.externalConnectionId,
                gmailMessageId: input.normalizedMessage.gmailMessageId,
                matchedQueryKey: input.matchedQueryKey,
                stage: "subscription_registry_ingest",
                error:
                  registryError instanceof Error
                    ? registryError.message
                    : "subscription_registry_ingest_failed"
              }
            });
            return null;
          });

        if (registryResult) {
          if (lifecycle.lifecycleEmailType === "CANCELLATION") {
            await this.externalAccountRepository.createAuditEvent({
              userId: input.userId,
              eventType: "gmail_subscription_cancellation_processed",
              metadata: {
                externalConnectionId: input.externalConnectionId,
                gmailMessageId: input.normalizedMessage.gmailMessageId,
                subscriptionId: registryResult.subscriptionId
              }
            });
          } else if (lifecycle.lifecycleEmailType === "RENEWAL") {
            await this.externalAccountRepository.createAuditEvent({
              userId: input.userId,
              eventType: "gmail_subscription_auto_updated",
              metadata: {
                externalConnectionId: input.externalConnectionId,
                gmailMessageId: input.normalizedMessage.gmailMessageId,
                subscriptionId: registryResult.subscriptionId
              }
            });
          }
        }
      }

      return {
        skippedAsExactDuplicate: false,
        messageRecordId: record.id,
        ingestion
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        await this.externalAccountRepository.createAuditEvent({
          userId: input.userId,
          obligationId: ingestion.obligationId,
          eventType: "gmail_duplicate_suppressed",
          metadata: {
            externalConnectionId: input.externalConnectionId,
            gmailMessageId: input.normalizedMessage.gmailMessageId,
            reason: "concurrent_duplicate"
          }
        });

        return {
          skippedAsExactDuplicate: true,
          messageRecordId: null,
          ingestion: null
        };
      }

      throw error;
    }
  }

  private async emitIngestionAuditEvents(
    input: {
      userId: string;
      externalConnectionId: string;
      matchedQueryKey: string;
      normalizedMessage: NormalizedGmailMessage;
    },
    ingestion: IngestionResult,
    dedupeReason: string | null,
    lifecycle: GmailSubscriptionHeuristicResult
  ) {
    if (ingestion.status === "DUPLICATE" || ingestion.duplicateCandidate) {
      await this.externalAccountRepository.createAuditEvent({
        userId: input.userId,
        obligationId: ingestion.obligationId,
        eventType: "gmail_duplicate_suppressed",
        metadata: {
          externalConnectionId: input.externalConnectionId,
          gmailMessageId: input.normalizedMessage.gmailMessageId,
          reason: dedupeReason ?? "duplicate_detected",
          duplicateOfObligationId: ingestion.duplicateOfObligationId
        }
      });

      if (lifecycle.lifecycleEmailType !== "CANCELLATION") {
        await this.externalAccountRepository.createAuditEvent({
          userId: input.userId,
          obligationId: ingestion.obligationId,
          eventType: "gmail_prediction_strengthened",
          metadata: {
            externalConnectionId: input.externalConnectionId,
            gmailMessageId: input.normalizedMessage.gmailMessageId,
            duplicateOfObligationId: ingestion.duplicateOfObligationId,
            conflictWithObligationId: ingestion.conflictWithObligationId
          }
        });
      }
      return;
    }

    if (ingestion.obligationId) {
      await this.externalAccountRepository.createAuditEvent({
        userId: input.userId,
        obligationId: ingestion.obligationId,
        eventType: "gmail_candidate_created",
        metadata: {
          externalConnectionId: input.externalConnectionId,
          gmailMessageId: input.normalizedMessage.gmailMessageId,
          matchedQueryKey: input.matchedQueryKey,
          confidence: ingestion.confidence,
          confidenceBand: ingestion.confidenceBand,
          status: ingestion.status,
          needsReview: ingestion.needsReview,
          conflictDetected: ingestion.conflictDetected
        }
      });

      if (lifecycle.lifecycleEmailType !== "UNKNOWN") {
        await this.externalAccountRepository.createAuditEvent({
          userId: input.userId,
          obligationId: ingestion.obligationId,
          eventType: "gmail_subscription_candidate_created",
          metadata: {
            externalConnectionId: input.externalConnectionId,
            gmailMessageId: input.normalizedMessage.gmailMessageId,
            matchedQueryKey: input.matchedQueryKey,
            lifecycleEmailType: lifecycle.lifecycleEmailType,
            confidenceScore: lifecycle.confidence.confidenceScore,
            confidenceBand: lifecycle.confidence.confidenceBand,
            reviewReasons: lifecycle.confidence.reviewReasons,
            subscriptionVendor: lifecycle.extraction.vendor,
            planName: lifecycle.extraction.planName
          }
        });
      }
      return;
    }

    await this.externalAccountRepository.createAuditEvent({
      userId: input.userId,
      eventType: "gmail_candidate_skipped",
      metadata: {
        externalConnectionId: input.externalConnectionId,
        gmailMessageId: input.normalizedMessage.gmailMessageId,
        matchedQueryKey: input.matchedQueryKey,
        reason: dedupeReason ?? "insufficient_signal"
      }
    });
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
