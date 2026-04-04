import { Prisma } from "@prisma/client";
import { ExternalAccountRepository } from "../repositories/external-account.repository";
import { IngestionResult, IngestionService } from "./ingestion.service";
import {
  NormalizedGmailMessage
} from "./gmail-message-normalizer";
import { GmailDedupeService } from "./gmail-dedupe.service";

export type GmailMessageIngestionResult = {
  skippedAsExactDuplicate: boolean;
  messageRecordId: string | null;
  ingestion: IngestionResult | null;
};

export class GmailIngestionService {
  private readonly externalAccountRepository = new ExternalAccountRepository();
  private readonly ingestionService = new IngestionService();
  private readonly dedupeService = new GmailDedupeService();

  async ingestMessage(input: {
    userId: string;
    externalConnectionId: string;
    matchedQueryKey: string;
    normalizedMessage: NormalizedGmailMessage;
  }): Promise<GmailMessageIngestionResult> {
    const existing = await this.externalAccountRepository.findMessageIngestion(
      input.externalConnectionId,
      input.normalizedMessage.gmailMessageId
    );

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
      internalDate: input.normalizedMessage.internalDate
    });

    const messageStatus = this.dedupeService.toMessageStatus(ingestion);
    const dedupeReason = this.dedupeService.buildReason(ingestion);

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
          status: ingestion.status
        }
      });

      await this.emitIngestionAuditEvents(input, ingestion, dedupeReason);

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
    dedupeReason: string | null
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
