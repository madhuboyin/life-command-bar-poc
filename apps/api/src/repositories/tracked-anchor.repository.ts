import { AnchorStatus, Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import type {
  CreateTrackedAnchorInput,
  UpdateTrackedAnchorInput
} from "../types/anchor-tracking.types";

export type TrackedAnchorRepositoryClient = Pick<typeof prisma, "trackedAnchor">;
type DbClient = Prisma.TransactionClient | TrackedAnchorRepositoryClient;

export class TrackedAnchorRepository {
  constructor(private readonly db: TrackedAnchorRepositoryClient = prisma) {}

  async runInTransaction<T>(handler: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction((tx) => handler(tx));
  }

  async createAnchor(
    userId: string,
    input: CreateTrackedAnchorInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(this.db, tx);
    return db.trackedAnchor.create({
      data: buildCreateInput(userId, input)
    });
  }

  async getById(anchorId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(this.db, tx);
    return db.trackedAnchor.findUnique({
      where: {
        id: anchorId
      }
    });
  }

  async getByUserId(anchorId: string, userId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(this.db, tx);
    return db.trackedAnchor.findFirst({
      where: {
        id: anchorId,
        userId
      }
    });
  }

  async listForUser(userId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(this.db, tx);
    return db.trackedAnchor.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });
  }

  async listActiveForUser(userId: string, tx?: Prisma.TransactionClient) {
    const db = getDb(this.db, tx);
    return db.trackedAnchor.findMany({
      where: {
        userId,
        status: AnchorStatus.ACTIVE
      },
      orderBy: [{ nextExpectedDate: "asc" }, { createdAt: "desc" }]
    });
  }

  async updateAnchor(
    anchorId: string,
    userId: string,
    patch: UpdateTrackedAnchorInput,
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(this.db, tx);
    const existing = await this.getByUserId(anchorId, userId, tx);
    if (!existing) return null;

    return db.trackedAnchor.update({
      where: { id: existing.id },
      data: buildUpdateInput(patch)
    });
  }

  async pauseAnchor(anchorId: string, userId: string, tx?: Prisma.TransactionClient) {
    return this.updateAnchor(anchorId, userId, { status: AnchorStatus.PAUSED }, tx);
  }

  async cancelAnchor(anchorId: string, userId: string, tx?: Prisma.TransactionClient) {
    return this.updateAnchor(anchorId, userId, { status: AnchorStatus.CANCELLED }, tx);
  }

  async archiveAnchor(anchorId: string, userId: string, tx?: Prisma.TransactionClient) {
    return this.updateAnchor(anchorId, userId, { status: AnchorStatus.ARCHIVED }, tx);
  }

  async markConfirmed(
    anchorId: string,
    userId: string,
    timestamp = new Date(),
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(this.db, tx);
    const existing = await this.getByUserId(anchorId, userId, tx);
    if (!existing) return null;

    return db.trackedAnchor.update({
      where: { id: existing.id },
      data: {
        lastConfirmedAt: timestamp,
        lastSnoozedUntil: null
      }
    });
  }

  async markObserved(
    anchorId: string,
    userId: string,
    timestamp = new Date(),
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(this.db, tx);
    const existing = await this.getByUserId(anchorId, userId, tx);
    if (!existing) return null;

    return db.trackedAnchor.update({
      where: { id: existing.id },
      data: {
        lastObservedAt: timestamp
      }
    });
  }

  async markSurfaced(
    anchorId: string,
    userId: string,
    timestamp = new Date(),
    tx?: Prisma.TransactionClient
  ) {
    const db = getDb(this.db, tx);
    const existing = await this.getByUserId(anchorId, userId, tx);
    if (!existing) return null;

    return db.trackedAnchor.update({
      where: { id: existing.id },
      data: {
        lastSurfacedAt: timestamp
      }
    });
  }

  async snoozeAnchor(
    anchorId: string,
    userId: string,
    until: string | Date,
    tx?: Prisma.TransactionClient
  ) {
    return this.updateAnchor(
      anchorId,
      userId,
      {
        lastSnoozedUntil: until
      },
      tx
    );
  }
}

function buildCreateInput(
  userId: string,
  input: CreateTrackedAnchorInput
): Prisma.TrackedAnchorUncheckedCreateInput {
  return {
    userId,
    label: input.label,
    normalizedLabel: input.normalizedLabel ?? null,
    category: input.category,
    recurrenceType: input.recurrenceType ?? "UNKNOWN",
    recurrenceInterval: input.recurrenceInterval ?? null,
    recurrenceUnit: input.recurrenceUnit ?? null,
    expectedAmount: input.expectedAmount ?? null,
    currencyCode: input.currencyCode ?? null,
    nextExpectedDate: asDateOrNull(input.nextExpectedDate),
    expectedWindowStart: asDateOrNull(input.expectedWindowStart),
    expectedWindowEnd: asDateOrNull(input.expectedWindowEnd),
    status: "ACTIVE",
    source: input.source ?? "USER_ADDED",
    confidence: input.confidence ?? "USER_PROVIDED",
    notes: input.notes ?? null,
    reminderLeadDays: input.reminderLeadDays ?? null,
    vendorId: input.vendorId ?? null,
    linkedObligationId: input.linkedObligationId ?? null
  };
}

function buildUpdateInput(
  input: UpdateTrackedAnchorInput
): Prisma.TrackedAnchorUncheckedUpdateInput {
  return {
    label: input.label,
    normalizedLabel: input.normalizedLabel,
    category: input.category,
    recurrenceType: input.recurrenceType,
    recurrenceInterval: input.recurrenceInterval,
    recurrenceUnit: input.recurrenceUnit,
    expectedAmount: input.expectedAmount,
    currencyCode: input.currencyCode,
    nextExpectedDate: asDateOrUndefined(input.nextExpectedDate),
    expectedWindowStart: asDateOrUndefined(input.expectedWindowStart),
    expectedWindowEnd: asDateOrUndefined(input.expectedWindowEnd),
    status: input.status,
    source: input.source,
    confidence: input.confidence,
    notes: input.notes,
    reminderLeadDays: input.reminderLeadDays,
    vendorId: input.vendorId,
    linkedObligationId: input.linkedObligationId,
    lastSnoozedUntil: asDateOrUndefined(input.lastSnoozedUntil)
  };
}

function asDateOrNull(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

function asDateOrUndefined(value: string | Date | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

function getDb(
  db: TrackedAnchorRepositoryClient,
  tx?: Prisma.TransactionClient
): DbClient {
  return tx ?? db;
}
