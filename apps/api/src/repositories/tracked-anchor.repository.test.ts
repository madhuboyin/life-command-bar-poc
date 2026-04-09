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
import {
  TrackedAnchorRepository,
  type TrackedAnchorRepositoryClient
} from "./tracked-anchor.repository";

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

function createRepository() {
  const records = new Map<string, AnchorRecord>();
  let sequence = 0;

  const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, sequence++));

  const clone = (record: AnchorRecord) => structuredClone(record);

  const trackedAnchor = {
    async create(args: { data: Record<string, unknown> }) {
      const timestamp = now();
      const record: AnchorRecord = {
        id: `anchor_${sequence}`,
        userId: args.data.userId as string,
        label: args.data.label as string,
        normalizedLabel: (args.data.normalizedLabel as string | null) ?? null,
        category: args.data.category as AnchorCategory,
        recurrenceType: args.data.recurrenceType as AnchorRecurrenceType,
        recurrenceInterval: (args.data.recurrenceInterval as number | null) ?? null,
        recurrenceUnit: (args.data.recurrenceUnit as AnchorRecurrenceUnit | null) ?? null,
        expectedAmount: (args.data.expectedAmount as number | null) ?? null,
        currencyCode: (args.data.currencyCode as string | null) ?? null,
        nextExpectedDate: (args.data.nextExpectedDate as Date | null) ?? null,
        expectedWindowStart: (args.data.expectedWindowStart as Date | null) ?? null,
        expectedWindowEnd: (args.data.expectedWindowEnd as Date | null) ?? null,
        status: (args.data.status as AnchorStatus) ?? AnchorStatus.ACTIVE,
        source: (args.data.source as AnchorSource) ?? AnchorSource.USER_ADDED,
        confidence:
          (args.data.confidence as AnchorConfidence) ??
          AnchorConfidence.USER_PROVIDED,
        notes: (args.data.notes as string | null) ?? null,
        reminderLeadDays: (args.data.reminderLeadDays as number | null) ?? null,
        lastConfirmedAt: null,
        lastObservedAt: null,
        lastSurfacedAt: null,
        lastSnoozedUntil: null,
        vendorId: (args.data.vendorId as string | null) ?? null,
        linkedObligationId: (args.data.linkedObligationId as string | null) ?? null,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      records.set(record.id, record);
      return clone(record);
    },
    async findUnique(args: { where: { id: string } }) {
      const record = records.get(args.where.id);
      return record ? clone(record) : null;
    },
    async findFirst(args: { where: { id?: string; userId?: string } }) {
      for (const record of records.values()) {
        if (args.where.id && record.id !== args.where.id) continue;
        if (args.where.userId && record.userId !== args.where.userId) continue;
        return clone(record);
      }

      return null;
    },
    async findMany(args: { where: { userId: string; status?: AnchorStatus }; orderBy?: unknown }) {
      const filtered = Array.from(records.values()).filter((record) => {
        if (record.userId !== args.where.userId) return false;
        if (args.where.status && record.status !== args.where.status) return false;
        return true;
      });

      if (Array.isArray(args.orderBy)) {
        const first = args.orderBy[0] as Record<string, string> | undefined;
        if (first?.nextExpectedDate === "asc") {
          filtered.sort((left, right) => {
            if (!left.nextExpectedDate && !right.nextExpectedDate) return 0;
            if (!left.nextExpectedDate) return 1;
            if (!right.nextExpectedDate) return -1;
            return left.nextExpectedDate.getTime() - right.nextExpectedDate.getTime();
          });
        } else {
          filtered.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
        }
      }

      return filtered.map(clone);
    },
    async update(args: { where: { id: string }; data: Record<string, unknown> }) {
      const existing = records.get(args.where.id);
      if (!existing) {
        throw new Error("record not found");
      }

      const data = args.data;
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        (existing as Record<string, unknown>)[key] = value;
      }
      existing.updatedAt = now();
      records.set(existing.id, existing);
      return clone(existing);
    }
  };

  return {
    repository: new TrackedAnchorRepository({
      trackedAnchor
    } as unknown as TrackedAnchorRepositoryClient)
  };
}

test("createAnchor persists required fields with safe defaults", async () => {
  const { repository } = createRepository();

  const created = await repository.createAnchor("user_1", {
    label: "Netflix",
    category: AnchorCategory.SUBSCRIPTION
  });

  assert.equal(created.userId, "user_1");
  assert.equal(created.label, "Netflix");
  assert.equal(created.category, AnchorCategory.SUBSCRIPTION);
  assert.equal(created.recurrenceType, AnchorRecurrenceType.UNKNOWN);
  assert.equal(created.status, AnchorStatus.ACTIVE);
  assert.equal(created.source, AnchorSource.USER_ADDED);
  assert.equal(created.confidence, AnchorConfidence.USER_PROVIDED);
});

test("createAnchor supports partial optional timing and amount fields", async () => {
  const { repository } = createRepository();

  const created = await repository.createAnchor("user_1", {
    label: "Electric bill",
    category: AnchorCategory.BILL,
    recurrenceType: AnchorRecurrenceType.RECURRING,
    recurrenceInterval: 1,
    recurrenceUnit: AnchorRecurrenceUnit.MONTH,
    expectedAmount: 89.5,
    currencyCode: "USD",
    nextExpectedDate: "2026-05-01T00:00:00.000Z",
    expectedWindowStart: "2026-04-27T00:00:00.000Z",
    expectedWindowEnd: "2026-05-04T00:00:00.000Z",
    reminderLeadDays: 4
  });

  assert.equal(created.recurrenceType, AnchorRecurrenceType.RECURRING);
  assert.equal(created.recurrenceInterval, 1);
  assert.equal(created.recurrenceUnit, AnchorRecurrenceUnit.MONTH);
  assert.equal(created.expectedAmount, 89.5);
  assert.equal(created.currencyCode, "USD");
  assert.equal(
    created.nextExpectedDate?.toISOString(),
    "2026-05-01T00:00:00.000Z"
  );
  assert.equal(created.reminderLeadDays, 4);
});

test("getByUserId and listForUser enforce user scoping", async () => {
  const { repository } = createRepository();
  const one = await repository.createAnchor("user_1", {
    label: "Gym",
    category: AnchorCategory.MEMBERSHIP
  });
  await repository.createAnchor("user_2", {
    label: "Insurance",
    category: AnchorCategory.INSURANCE
  });

  const scoped = await repository.getByUserId(one.id, "user_1");
  const forbidden = await repository.getByUserId(one.id, "user_2");
  const list = await repository.listForUser("user_1");

  assert.equal(scoped?.id, one.id);
  assert.equal(forbidden, null);
  assert.equal(list.length, 1);
  assert.equal(list[0]?.userId, "user_1");
});

test("updateAnchor patches allowed fields without crossing user boundaries", async () => {
  const { repository } = createRepository();
  const created = await repository.createAnchor("user_1", {
    label: "Car insurance",
    category: AnchorCategory.INSURANCE
  });

  const denied = await repository.updateAnchor(created.id, "user_2", {
    notes: "wrong user"
  });
  const updated = await repository.updateAnchor(created.id, "user_1", {
    notes: "confirm annually",
    recurrenceType: AnchorRecurrenceType.RECURRING,
    recurrenceInterval: 1,
    recurrenceUnit: AnchorRecurrenceUnit.YEAR
  });

  assert.equal(denied, null);
  assert.equal(updated?.notes, "confirm annually");
  assert.equal(updated?.recurrenceUnit, AnchorRecurrenceUnit.YEAR);
});

test("lifecycle transitions update status and timestamps deterministically", async () => {
  const { repository } = createRepository();
  const created = await repository.createAnchor("user_1", {
    label: "Streaming",
    category: AnchorCategory.SUBSCRIPTION
  });
  const ts = new Date("2026-04-08T12:00:00.000Z");

  const paused = await repository.pauseAnchor(created.id, "user_1");
  const cancelled = await repository.cancelAnchor(created.id, "user_1");
  const archived = await repository.archiveAnchor(created.id, "user_1");
  const snoozed = await repository.snoozeAnchor(
    created.id,
    "user_1",
    "2026-04-15T00:00:00.000Z"
  );
  const confirmed = await repository.markConfirmed(created.id, "user_1", ts);
  const observed = await repository.markObserved(created.id, "user_1", ts);
  const surfaced = await repository.markSurfaced(created.id, "user_1", ts);

  assert.equal(paused?.status, AnchorStatus.PAUSED);
  assert.equal(cancelled?.status, AnchorStatus.CANCELLED);
  assert.equal(archived?.status, AnchorStatus.ARCHIVED);
  assert.equal(snoozed?.lastSnoozedUntil?.toISOString(), "2026-04-15T00:00:00.000Z");
  assert.equal(confirmed?.lastConfirmedAt?.toISOString(), ts.toISOString());
  assert.equal(confirmed?.lastSnoozedUntil, null);
  assert.equal(observed?.lastObservedAt?.toISOString(), ts.toISOString());
  assert.equal(surfaced?.lastSurfacedAt?.toISOString(), ts.toISOString());
});

test("listActiveForUser returns only ACTIVE anchors", async () => {
  const { repository } = createRepository();
  const toArchive = await repository.createAnchor("user_1", {
    label: "Will archive",
    category: AnchorCategory.BILL
  });
  await repository.archiveAnchor(toArchive.id, "user_1");
  await repository.createAnchor("user_1", {
    label: "Phone",
    category: AnchorCategory.BILL
  });

  const items = await repository.listActiveForUser("user_1");
  assert.equal(items.length, 1);
  assert.ok(items.every((item) => item.status === AnchorStatus.ACTIVE));
});
