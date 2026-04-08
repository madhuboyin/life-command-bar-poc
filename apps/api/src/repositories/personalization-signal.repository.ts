import { Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { BEHAVIOR_SIGNAL_AUDIT_EVENT_TYPE } from "../types/behavior-profile.types";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type BehaviorSignalAuditEventRecord = {
  id: string;
  userId: string;
  obligationId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
};

export class PersonalizationSignalRepository {
  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async createSignalEvent(
    input: {
      userId: string;
      obligationId?: string | null;
      metadata: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? prisma;
    return createAuditEvent(
      {
        userId: input.userId,
        obligationId: input.obligationId ?? null,
        eventType: BEHAVIOR_SIGNAL_AUDIT_EVENT_TYPE,
        metadata: input.metadata
      },
      db
    );
  }

  async listSignalEvents(input: {
    userId: string;
    windowStart?: Date;
    windowEnd?: Date;
    limit?: number;
  }): Promise<BehaviorSignalAuditEventRecord[]> {
    return prisma.auditEvent.findMany({
      where: {
        userId: input.userId,
        eventType: BEHAVIOR_SIGNAL_AUDIT_EVENT_TYPE,
        createdAt:
          input.windowStart || input.windowEnd
            ? {
                gte: input.windowStart,
                lte: input.windowEnd
              }
            : undefined
      },
      select: {
        id: true,
        userId: true,
        obligationId: true,
        metadata: true,
        createdAt: true
      },
      orderBy: {
        createdAt: "asc"
      },
      take: input.limit ?? 5000
    });
  }

  async countSignalEventsSince(input: { userId: string; since?: Date | null }) {
    return prisma.auditEvent.count({
      where: {
        userId: input.userId,
        eventType: BEHAVIOR_SIGNAL_AUDIT_EVENT_TYPE,
        createdAt: input.since
          ? {
              gt: input.since
            }
          : undefined
      }
    });
  }

  async createInternalAuditEvent(
    input: {
      userId: string;
      eventType: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient
  ) {
    const db: DbClient = tx ?? prisma;
    return createAuditEvent(
      {
        userId: input.userId,
        eventType: input.eventType,
        metadata: input.metadata
      },
      db
    );
  }
}
