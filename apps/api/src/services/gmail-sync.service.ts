import { ExternalSyncStatus } from "@prisma/client";
import { AppError } from "../utils/app-error";
import { ExternalAccountRepository } from "../repositories/external-account.repository";
import {
  GmailApiMessage,
  normalizeGmailMessage,
  type NormalizedGmailMessage
} from "./gmail-message-normalizer";
import { GmailQueryService } from "./gmail-query.service";
import { GmailAuthService } from "./gmail-auth.service";
import { GmailIngestionService } from "./gmail-ingestion.service";

type GmailMessageListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailSyncMode = "INITIAL_BACKFILL" | "MANUAL_RESYNC" | "INCREMENTAL";

export type GmailSyncResult = {
  mode: GmailSyncMode;
  windowDays: 30 | 90 | 365;
  queries: Array<{
    key: string;
    query: string;
    matched: number;
  }>;
  stats: {
    matchedMessages: number;
    fetchedMessages: number;
    ingestedCandidates: number;
    reviewRouted: number;
    duplicateSuppressed: number;
    errors: number;
    skippedAlreadyProcessed: number;
  };
  lastProcessedMessageId: string | null;
  lastProcessedMessageDate: string | null;
  completedAt: string;
};

export class GmailSyncService {
  private readonly repository = new ExternalAccountRepository();
  private readonly queryService = new GmailQueryService();
  private readonly authService = new GmailAuthService();
  private readonly ingestionService = new GmailIngestionService();

  async sync(input: {
    userId: string;
    mode: GmailSyncMode;
    windowDays?: 30 | 90 | 365;
    scanSubscriptions?: boolean;
    scanBills?: boolean;
    scanRenewals?: boolean;
    includeRecurringReceipts?: boolean;
    maxMessages?: number;
  }): Promise<GmailSyncResult> {
    const connection = await this.authService.ensureActiveConnection(input.userId);

    const windowDays = input.windowDays ?? (connection.lastSyncWindowDays as 30 | 90 | 365 | null) ?? 30;
    const scanSubscriptions = input.scanSubscriptions ?? connection.scanSubscriptions;
    const scanBills = input.scanBills ?? connection.scanBills;
    const scanRenewals = input.scanRenewals ?? connection.scanRenewals;
    const includeRecurringReceipts =
      input.includeRecurringReceipts ?? connection.includeRecurringReceipts;

    if (!scanSubscriptions && !scanBills && !scanRenewals && !includeRecurringReceipts) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Enable at least one Gmail scan category before syncing",
        400
      );
    }

    const maxMessages = clamp(input.maxMessages ?? defaultMaxMessages(windowDays), 20, 500);

    await this.repository.updateGmailConnection(input.userId, {
      lastSyncStatus: ExternalSyncStatus.RUNNING,
      lastSyncWindowDays: windowDays,
      errorCode: null,
      errorMessage: null
    });

    await this.repository.createAuditEvent({
      userId: input.userId,
      eventType: "gmail_sync_started",
      metadata: {
        externalConnectionId: connection.id,
        mode: input.mode,
        windowDays,
        scanSubscriptions,
        scanBills,
        scanRenewals,
        includeRecurringReceipts,
        maxMessages
      }
    });

    try {
      const queries = this.queryService.buildQueries({
        windowDays,
        scanSubscriptions,
        scanBills,
        scanRenewals,
        includeRecurringReceipts
      });

      const queryCounters = new Map<string, number>();
      for (const query of queries) {
        queryCounters.set(query.key, 0);
      }

      let accessToken = await this.authService.getAccessToken(input.userId);

      const messageToQuery = new Map<string, string>();
      for (const query of queries) {
        const messageIds = await this.collectMessageIdsForQuery({
          accessToken,
          query: query.query,
          maxMessages: maxMessages - messageToQuery.size,
          onRefresh: async () => {
            accessToken = await this.authService.refreshAccessToken(input.userId);
            return accessToken;
          }
        });

        for (const message of messageIds) {
          if (messageToQuery.size >= maxMessages) break;
          if (messageToQuery.has(message.id)) continue;
          messageToQuery.set(message.id, query.key);
        }

        queryCounters.set(query.key, messageIds.length);
        if (messageToQuery.size >= maxMessages) break;
      }

      const stats = {
        matchedMessages: messageToQuery.size,
        fetchedMessages: 0,
        ingestedCandidates: 0,
        reviewRouted: 0,
        duplicateSuppressed: 0,
        errors: 0,
        skippedAlreadyProcessed: 0
      };

      let latestMessage: { id: string | null; dateIso: string | null } = {
        id: connection.lastProcessedMessageId ?? null,
        dateIso: connection.lastProcessedMessageDate?.toISOString() ?? null
      };

      for (const [messageId, matchedQueryKey] of messageToQuery.entries()) {
        try {
          await this.repository.createAuditEvent({
            userId: input.userId,
            eventType: "gmail_message_matched",
            metadata: {
              externalConnectionId: connection.id,
              gmailMessageId: messageId,
              matchedQueryKey
            }
          });

          const message = await this.fetchMessageById({
            accessToken,
            messageId,
            onRefresh: async () => {
              accessToken = await this.authService.refreshAccessToken(input.userId);
              return accessToken;
            }
          });

          const normalized = normalizeGmailMessage(message);
          const ingestion = await this.ingestionService.ingestMessage({
            userId: input.userId,
            externalConnectionId: connection.id,
            matchedQueryKey,
            normalizedMessage: normalized
          });

          stats.fetchedMessages += 1;

          if (ingestion.skippedAsExactDuplicate) {
            stats.skippedAlreadyProcessed += 1;
            continue;
          }

          if (!ingestion.ingestion) {
            continue;
          }

          if (ingestion.ingestion.status === "DUPLICATE" || ingestion.ingestion.duplicateCandidate) {
            stats.duplicateSuppressed += 1;
          } else if (ingestion.ingestion.obligationId) {
            stats.ingestedCandidates += 1;
            if (ingestion.ingestion.needsReview || ingestion.ingestion.conflictDetected) {
              stats.reviewRouted += 1;
            }
          }

          latestMessage = pickLatestMessage(latestMessage, normalized);
        } catch (error) {
          stats.errors += 1;

          await this.repository.createAuditEvent({
            userId: input.userId,
            eventType: "gmail_sync_error",
            metadata: {
              externalConnectionId: connection.id,
              gmailMessageId: messageId,
              matchedQueryKey,
              error: error instanceof Error ? error.message : "unknown_error"
            }
          });
        }
      }

      const completedAt = new Date();

      await this.repository.updateGmailConnection(input.userId, {
        lastSyncedAt: completedAt,
        lastSyncStatus: ExternalSyncStatus.COMPLETED,
        lastSyncCursor: null,
        lastProcessedMessageId: latestMessage.id,
        lastProcessedMessageDate: latestMessage.dateIso ? new Date(latestMessage.dateIso) : null,
        lastSyncMatchedCount: stats.matchedMessages,
        lastSyncIngestedCount: stats.ingestedCandidates,
        lastSyncDuplicateCount: stats.duplicateSuppressed + stats.skippedAlreadyProcessed,
        lastSyncErrorCount: stats.errors,
        errorCode: null,
        errorMessage: null
      });

      await this.repository.createAuditEvent({
        userId: input.userId,
        eventType: "gmail_sync_completed",
        metadata: {
          externalConnectionId: connection.id,
          mode: input.mode,
          windowDays,
          stats
        }
      });

      return {
        mode: input.mode,
        windowDays,
        queries: queries.map((query) => ({
          key: query.key,
          query: query.query,
          matched: queryCounters.get(query.key) ?? 0
        })),
        stats,
        lastProcessedMessageId: latestMessage.id,
        lastProcessedMessageDate: latestMessage.dateIso,
        completedAt: completedAt.toISOString()
      };
    } catch (error) {
      const completedAt = new Date();
      const errorCode = error instanceof AppError ? error.code : "gmail_sync_failed";
      const errorMessage = error instanceof Error ? error.message : "Unexpected Gmail sync error";

      await this.repository.updateGmailConnection(input.userId, {
        lastSyncedAt: completedAt,
        lastSyncStatus: ExternalSyncStatus.ERROR,
        lastSyncErrorCount: (connection.lastSyncErrorCount ?? 0) + 1,
        errorCode,
        errorMessage
      });

      await this.repository.createAuditEvent({
        userId: input.userId,
        eventType: "gmail_sync_error",
        metadata: {
          externalConnectionId: connection.id,
          mode: input.mode,
          windowDays,
          stage: "sync_pipeline",
          errorCode,
          error: errorMessage
        }
      });

      throw error;
    }
  }

  private async collectMessageIdsForQuery(input: {
    accessToken: string;
    query: string;
    maxMessages: number;
    onRefresh: () => Promise<string>;
  }) {
    if (input.maxMessages <= 0) return [] as Array<{ id: string; threadId?: string }>;

    const matched: Array<{ id: string; threadId?: string }> = [];
    let pageToken: string | undefined;
    let pages = 0;
    let token = input.accessToken;
    let refreshedToken = false;

    while (matched.length < input.maxMessages && pages < 12) {
      const perPage = Math.min(100, input.maxMessages - matched.length);
      const params = new URLSearchParams({
        q: input.query,
        maxResults: String(perPage)
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          if (refreshedToken) {
            throw new AppError("INTEGRATION_ERROR", "Gmail authorization expired", 401);
          }

          token = await input.onRefresh();
          refreshedToken = true;
          continue;
        }

        throw new AppError("INTEGRATION_ERROR", "Could not search Gmail messages", 502, {
          status: response.status
        });
      }

      const payload = (await response.json()) as GmailMessageListResponse;
      if (Array.isArray(payload.messages)) {
        matched.push(...payload.messages);
      }

      if (!payload.nextPageToken) {
        break;
      }

      pageToken = payload.nextPageToken;
      pages += 1;
    }

    return matched.slice(0, input.maxMessages);
  }

  private async fetchMessageById(input: {
    accessToken: string;
    messageId: string;
    onRefresh: () => Promise<string>;
  }) {
    let token = input.accessToken;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const params = new URLSearchParams({
        format: "full",
        metadataHeaders: "From"
      });
      params.append("metadataHeaders", "Subject");
      params.append("metadataHeaders", "Date");

      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.status === 401 && attempt === 0) {
        token = await input.onRefresh();
        continue;
      }

      if (!response.ok) {
        throw new AppError("INTEGRATION_ERROR", "Could not fetch Gmail message details", 502, {
          gmailMessageId: input.messageId,
          status: response.status
        });
      }

      return (await response.json()) as GmailApiMessage;
    }

    throw new AppError("INTEGRATION_ERROR", "Could not fetch Gmail message details", 502);
  }
}

function clamp(value: number, minValue: number, maxValue: number) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function defaultMaxMessages(windowDays: 30 | 90 | 365) {
  if (windowDays === 30) return 140;
  if (windowDays === 90) return 240;
  return 320;
}

function pickLatestMessage(
  existing: { id: string | null; dateIso: string | null },
  normalized: NormalizedGmailMessage
) {
  const candidateDate = normalized.internalDate ?? normalized.messageDate;
  if (!candidateDate) {
    return existing;
  }

  if (!existing.dateIso) {
    return {
      id: normalized.gmailMessageId,
      dateIso: candidateDate
    };
  }

  const existingTime = new Date(existing.dateIso).getTime();
  const candidateTime = new Date(candidateDate).getTime();

  if (Number.isNaN(candidateTime) || candidateTime < existingTime) {
    return existing;
  }

  return {
    id: normalized.gmailMessageId,
    dateIso: candidateDate
  };
}
