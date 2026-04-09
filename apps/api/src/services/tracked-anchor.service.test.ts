import assert from "node:assert/strict";
import test from "node:test";
import {
  AnchorCategory,
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorSource,
  AnchorStatus
} from "@prisma/client";
import { TrackedAnchorService } from "./tracked-anchor.service";
import { AnchorTrackingEngineService } from "./anchor-tracking-engine.service";
import { TrackedAnchorRepository } from "../repositories/tracked-anchor.repository";

type AnchorRecord = {
  id: string;
  userId: string;
  label: string;
  normalizedLabel: string | null;
  category: AnchorCategory;
  recurrenceType: AnchorRecurrenceType;
  recurrenceInterval: number | null;
  recurrenceUnit: AnchorRecurrenceUnit | null;
  expectedAmount: number | null;
  currencyCode: string | null;
  nextExpectedDate: Date | null;
  expectedWindowStart: Date | null;
  expectedWindowEnd: Date | null;
  status: AnchorStatus;
  source: AnchorSource;
  confidence: AnchorConfidence;
  notes: string | null;
  reminderLeadDays: number | null;
  lastConfirmedAt: Date | null;
  lastObservedAt: Date | null;
  lastSurfacedAt: Date | null;
  lastSnoozedUntil: Date | null;
  vendorId: string | null;
  linkedObligationId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createServiceFixture() {
  const records = new Map<string, AnchorRecord>();
  let sequence = 0;
  const now = () => new Date(Date.UTC(2026, 3, 8, 12, 0, sequence++));

  const repository = {
    async createAnchor(userId: string, input: Record<string, unknown>) {
      const timestamp = now();
      const record: AnchorRecord = {
        id: `anchor_${sequence}`,
        userId,
        label: input.label as string,
        normalizedLabel: (input.normalizedLabel as string | null) ?? null,
        category: input.category as AnchorCategory,
        recurrenceType: input.recurrenceType as AnchorRecurrenceType,
        recurrenceInterval: (input.recurrenceInterval as number | null) ?? null,
        recurrenceUnit: (input.recurrenceUnit as AnchorRecurrenceUnit | null) ?? null,
        expectedAmount: (input.expectedAmount as number | null) ?? null,
        currencyCode: (input.currencyCode as string | null) ?? null,
        nextExpectedDate: (input.nextExpectedDate as Date | null) ?? null,
        expectedWindowStart: (input.expectedWindowStart as Date | null) ?? null,
        expectedWindowEnd: (input.expectedWindowEnd as Date | null) ?? null,
        status: AnchorStatus.ACTIVE,
        source: (input.source as AnchorSource) ?? AnchorSource.USER_ADDED,
        confidence:
          (input.confidence as AnchorConfidence) ??
          AnchorConfidence.USER_PROVIDED,
        notes: (input.notes as string | null) ?? null,
        reminderLeadDays: (input.reminderLeadDays as number | null) ?? null,
        lastConfirmedAt: null,
        lastObservedAt: null,
        lastSurfacedAt: null,
        lastSnoozedUntil: null,
        vendorId: (input.vendorId as string | null) ?? null,
        linkedObligationId: (input.linkedObligationId as string | null) ?? null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      records.set(record.id, record);
      return structuredClone(record);
    },
    async getByUserId(anchorId: string, userId: string) {
      const item = records.get(anchorId);
      if (!item || item.userId !== userId) return null;
      return structuredClone(item);
    },
    async listForUser(userId: string) {
      return Array.from(records.values())
        .filter((item) => item.userId === userId)
        .map((item) => structuredClone(item));
    },
    async listActiveForUser(userId: string) {
      return Array.from(records.values())
        .filter((item) => item.userId === userId && item.status === AnchorStatus.ACTIVE)
        .map((item) => structuredClone(item));
    },
    async updateAnchor(anchorId: string, userId: string, patch: Record<string, unknown>) {
      const item = records.get(anchorId);
      if (!item || item.userId !== userId) return null;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        (item as Record<string, unknown>)[key] = value;
      }
      item.updatedAt = now();
      records.set(item.id, item);
      return structuredClone(item);
    },
    async pauseAnchor(anchorId: string, userId: string) {
      return this.updateAnchor(anchorId, userId, { status: AnchorStatus.PAUSED });
    },
    async cancelAnchor(anchorId: string, userId: string) {
      return this.updateAnchor(anchorId, userId, { status: AnchorStatus.CANCELLED });
    },
    async archiveAnchor(anchorId: string, userId: string) {
      return this.updateAnchor(anchorId, userId, { status: AnchorStatus.ARCHIVED });
    },
    async markConfirmed(anchorId: string, userId: string, timestamp: Date) {
      return this.updateAnchor(anchorId, userId, {
        lastConfirmedAt: timestamp,
        lastSnoozedUntil: null
      });
    },
    async markObserved(anchorId: string, userId: string, timestamp: Date) {
      return this.updateAnchor(anchorId, userId, { lastObservedAt: timestamp });
    },
    async markSurfaced(anchorId: string, userId: string, timestamp: Date) {
      return this.updateAnchor(anchorId, userId, { lastSurfacedAt: timestamp });
    },
    async snoozeAnchor(anchorId: string, userId: string, until: Date | string) {
      return this.updateAnchor(anchorId, userId, {
        lastSnoozedUntil: new Date(until)
      });
    }
  };

  const service = new TrackedAnchorService({
    repository: repository as unknown as TrackedAnchorRepository,
    trackingEngine: new AnchorTrackingEngineService(),
    now
  });

  return {
    service,
    records
  };
}

test("createAnchor normalizes key fields and computes initial window", async () => {
  const { service } = createServiceFixture();

  const created = await service.createAnchor("user_1", {
    label: "  Netflix Premium  ",
    category: "SUBSCRIPTION",
    recurrenceType: "RECURRING",
    recurrenceUnit: "MONTH",
    recurrenceInterval: 1,
    nextExpectedDate: "2026-05-01T00:00:00.000Z",
    currencyCode: "usd",
    reminderLeadDays: 4
  });

  assert.equal(created.label, "Netflix Premium");
  assert.equal(created.normalizedLabel, "netflix premium");
  assert.equal(created.currencyCode, "USD");
  assert.equal(created.nextExpectedDate?.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(
    created.expectedWindowStart?.toISOString(),
    "2026-04-27T00:00:00.000Z"
  );
  assert.equal(created.expectedWindowEnd?.toISOString(), "2026-05-04T00:00:00.000Z");
});

test("updateAnchor recomputes timing when next expected date is cleared", async () => {
  const { service, records } = createServiceFixture();
  const created = await service.createAnchor("user_1", {
    label: "Electric bill",
    category: "BILL",
    recurrenceType: "RECURRING",
    recurrenceUnit: "MONTH",
    recurrenceInterval: 1,
    nextExpectedDate: "2026-05-01T00:00:00.000Z"
  });

  const updated = await service.updateAnchor("user_1", created.id, {
    nextExpectedDate: null
  });

  assert.equal(updated?.confidence, AnchorConfidence.SYSTEM_INFERRED);
  assert.equal(updated?.nextExpectedDate?.toISOString(), "2026-05-08T12:00:02.000Z");
  assert.equal(records.get(created.id)?.nextExpectedDate?.toISOString(), "2026-05-08T12:00:02.000Z");
});

test("invalid enum values are rejected at the service boundary", async () => {
  const { service } = createServiceFixture();

  await assert.rejects(
    () =>
      service.createAnchor("user_1", {
        label: "Gym",
        category: "NOT_A_REAL_CATEGORY"
      }),
    /Invalid option/
  );
});
