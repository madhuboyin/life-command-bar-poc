import {
  ExternalAccountStatus,
  ExternalMessageIngestionStatus,
  ExternalProvider,
  ExternalSyncStatus,
  Prisma,
  ObligationStatus
} from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";

export class ExternalAccountRepository {
  async getGmailConnectionForUser(userId: string, _options?: { includeTokens?: boolean }) {
    return prisma.externalAccountConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: ExternalProvider.GOOGLE_GMAIL
        }
      },
      select: {
        id: true,
        userId: true,
        provider: true,
        providerAccountId: true,
        email: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        scope: true,
        status: true,
        errorCode: true,
        errorMessage: true,
        lastSyncedAt: true,
        lastHistoryId: true,
        lastProcessedMessageId: true,
        lastProcessedMessageDate: true,
        lastSyncStatus: true,
        lastSyncCursor: true,
        lastSyncWindowDays: true,
        lastSyncMatchedCount: true,
        lastSyncIngestedCount: true,
        lastSyncDuplicateCount: true,
        lastSyncErrorCount: true,
        autoSyncEnabled: true,
        scanSubscriptions: true,
        scanBills: true,
        scanRenewals: true,
        includeRecurringReceipts: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async upsertGmailConnection(input: {
    userId: string;
    providerAccountId: string;
    email: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    scope: string;
    autoSyncEnabled: boolean;
    scanSubscriptions: boolean;
    scanBills: boolean;
    scanRenewals: boolean;
    includeRecurringReceipts: boolean;
    lastHistoryId?: string | null;
  }) {
    return prisma.externalAccountConnection.upsert({
      where: {
        userId_provider: {
          userId: input.userId,
          provider: ExternalProvider.GOOGLE_GMAIL
        }
      },
      update: {
        providerAccountId: input.providerAccountId,
        email: input.email,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        scope: input.scope,
        status: ExternalAccountStatus.ACTIVE,
        errorCode: null,
        errorMessage: null,
        autoSyncEnabled: input.autoSyncEnabled,
        scanSubscriptions: input.scanSubscriptions,
        scanBills: input.scanBills,
        scanRenewals: input.scanRenewals,
        includeRecurringReceipts: input.includeRecurringReceipts,
        lastHistoryId: input.lastHistoryId ?? null,
        lastSyncStatus: ExternalSyncStatus.IDLE
      },
      create: {
        userId: input.userId,
        provider: ExternalProvider.GOOGLE_GMAIL,
        providerAccountId: input.providerAccountId,
        email: input.email,
        accessTokenEncrypted: input.accessTokenEncrypted,
        refreshTokenEncrypted: input.refreshTokenEncrypted,
        scope: input.scope,
        status: ExternalAccountStatus.ACTIVE,
        autoSyncEnabled: input.autoSyncEnabled,
        scanSubscriptions: input.scanSubscriptions,
        scanBills: input.scanBills,
        scanRenewals: input.scanRenewals,
        includeRecurringReceipts: input.includeRecurringReceipts,
        lastHistoryId: input.lastHistoryId ?? null,
        lastSyncStatus: ExternalSyncStatus.IDLE
      }
    });
  }

  async updateGmailConnection(userId: string, data: Prisma.ExternalAccountConnectionUpdateInput) {
    return prisma.externalAccountConnection.update({
      where: {
        userId_provider: {
          userId,
          provider: ExternalProvider.GOOGLE_GMAIL
        }
      },
      data
    });
  }

  async disconnectGmailConnection(userId: string) {
    return prisma.externalAccountConnection.update({
      where: {
        userId_provider: {
          userId,
          provider: ExternalProvider.GOOGLE_GMAIL
        }
      },
      data: {
        status: ExternalAccountStatus.DISCONNECTED,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        errorCode: null,
        errorMessage: null,
        lastSyncStatus: ExternalSyncStatus.IDLE,
        lastSyncCursor: null
      }
    });
  }

  async findMessageIngestion(connectionId: string, externalMessageId: string) {
    return prisma.externalMessageIngestion.findUnique({
      where: {
        externalConnectionId_externalMessageId: {
          externalConnectionId: connectionId,
          externalMessageId
        }
      }
    });
  }

  async createMessageIngestion(input: {
    userId: string;
    externalConnectionId: string;
    externalMessageId: string;
    externalThreadId?: string | null;
    messageDate?: Date | null;
    messageInternalDate?: Date | null;
    matchedQueryKey?: string | null;
    importSourceId?: string | null;
    obligationId?: string | null;
    status: ExternalMessageIngestionStatus;
    dedupeReason?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.externalMessageIngestion.create({
      data: {
        userId: input.userId,
        externalConnectionId: input.externalConnectionId,
        provider: ExternalProvider.GOOGLE_GMAIL,
        externalMessageId: input.externalMessageId,
        externalThreadId: input.externalThreadId ?? null,
        messageDate: input.messageDate ?? null,
        messageInternalDate: input.messageInternalDate ?? null,
        matchedQueryKey: input.matchedQueryKey ?? null,
        importSourceId: input.importSourceId ?? null,
        obligationId: input.obligationId ?? null,
        status: input.status,
        dedupeReason: input.dedupeReason ?? null,
        metadata: input.metadata
      }
    });
  }

  async createAuditEvent(input: {
    userId: string;
    obligationId?: string | null;
    eventType: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    return createAuditEvent({
      userId: input.userId,
      obligationId: input.obligationId ?? null,
      eventType: input.eventType,
      metadata: input.metadata
    });
  }

  async checkVendorHistory(userId: string, vendor: string | null, daysLookback: number = 365) {
    if (!vendor) {
      return { hasPriorVendor: false, isUnknownVendor: true, hasRejectedHistory: false };
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysLookback);

    const obligations = await prisma.obligation.findMany({
      where: {
        userId,
        vendor: {
          equals: vendor,
          mode: 'insensitive'
        },
        createdAt: {
          gte: sinceDate
        }
      },
      select: {
        status: true
      }
    });

    const hasPriorVendor = obligations.length > 0;
    const isUnknownVendor = obligations.length === 0;
    const hasRejectedHistory = obligations.some(
      (o) => o.status === ObligationStatus.IGNORED
    );

    return {
      hasPriorVendor,
      isUnknownVendor,
      hasRejectedHistory
    };
  }
}
