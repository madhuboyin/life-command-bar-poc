import assert from "node:assert/strict";
import test from "node:test";
import {
  AnchorCategory,
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorSource,
  AnchorStatus,
  ObligationType,
  type TrackedAnchor
} from "@prisma/client";
import type { TrackedAnchorRepository } from "../repositories/tracked-anchor.repository";
import { AnchorTrackingEngineService } from "./anchor-tracking-engine.service";
import {
  AnchorGmailEnrichmentService,
  toObservedAt
} from "./anchor-gmail-enrichment.service";
import { AnchorTrackingRolloutService } from "./anchor-tracking-rollout.service";

type RecordMap = Map<string, TrackedAnchor>;

function createAnchorFixture(): {
  records: RecordMap;
  repository: TrackedAnchorRepository;
} {
  const records = new Map<string, TrackedAnchor>();
  const baseAnchor: TrackedAnchor = {
    id: "anchor_1",
    userId: "user_1",
    label: "Netflix",
    normalizedLabel: "netflix",
    category: AnchorCategory.SUBSCRIPTION,
    recurrenceType: AnchorRecurrenceType.RECURRING,
    recurrenceInterval: 1,
    recurrenceUnit: AnchorRecurrenceUnit.MONTH,
    expectedAmount: null,
    currencyCode: null,
    nextExpectedDate: new Date("2026-05-01T00:00:00.000Z"),
    expectedWindowStart: new Date("2026-04-27T00:00:00.000Z"),
    expectedWindowEnd: new Date("2026-05-04T00:00:00.000Z"),
    status: AnchorStatus.ACTIVE,
    source: AnchorSource.USER_ADDED,
    confidence: AnchorConfidence.USER_PROVIDED,
    notes: null,
    reminderLeadDays: 4,
    lastConfirmedAt: null,
    lastObservedAt: null,
    lastSurfacedAt: null,
    lastSnoozedUntil: null,
    vendorId: null,
    linkedObligationId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
  records.set(baseAnchor.id, baseAnchor);

  const repository = {
    async listActiveForUser(userId: string) {
      return Array.from(records.values()).filter((item) => item.userId === userId);
    },
    async updateAnchor(anchorId: string, userId: string, patch: Record<string, unknown>) {
      const current = records.get(anchorId);
      if (!current || current.userId !== userId) return null;
      const next = {
        ...current,
        ...patch,
        updatedAt: new Date("2026-04-08T12:00:00.000Z")
      } as TrackedAnchor;
      records.set(anchorId, next);
      return next;
    },
    async markObserved(anchorId: string, userId: string, timestamp: Date) {
      const current = records.get(anchorId);
      if (!current || current.userId !== userId) return null;
      current.lastObservedAt = timestamp;
      records.set(anchorId, current);
      return current;
    }
  };

  return {
    records,
    repository: repository as unknown as TrackedAnchorRepository
  };
}

test("strong Gmail match confirms and refines anchor timing", async () => {
  const fixture = createAnchorFixture();
  const emittedEvents: string[] = [];
  const service = new AnchorGmailEnrichmentService({
    repository: fixture.repository,
    trackingEngine: new AnchorTrackingEngineService(),
    rolloutService: new AnchorTrackingRolloutService({
      env: {
        LCB_ANCHOR_STEP4_ENABLED: "true",
        LCB_ANCHOR_GMAIL_ENRICHMENT_ENABLED: "true",
        LCB_ANCHOR_TIMING_REFINEMENT_ENABLED: "true"
      }
    }),
    now: () => new Date("2026-04-08T12:00:00.000Z"),
    emitAuditEvent: async (input) => {
      emittedEvents.push(input.eventType);
      return null as never;
    }
  });

  const result = await service.enrichFromGmailSignal({
    userId: "user_1",
    signal: {
      obligationId: "obl_1",
      title: "Netflix monthly renewal",
      vendorName: "Netflix",
      obligationType: ObligationType.SUBSCRIPTION,
      dueDate: new Date("2026-04-27T00:00:00.000Z"),
      recurrence: "monthly",
      amount: null,
      currencyCode: null,
      confidenceScore: 0.9,
      source: "EMAIL",
      observedAt: new Date("2026-04-27T02:00:00.000Z")
    }
  });

  assert.equal(result.status, "CONFIRMED");
  const updated = fixture.records.get("anchor_1");
  assert.equal(updated?.linkedObligationId, "obl_1");
  assert.equal(updated?.confidence, AnchorConfidence.GMAIL_CONFIRMED);
  assert.equal(updated?.source, AnchorSource.USER_CONFIRMED_FROM_SIGNAL);
  assert.equal(updated?.nextExpectedDate?.toISOString(), "2026-05-27T00:00:00.000Z");
  assert.ok(emittedEvents.includes("anchor_confirmed_by_gmail"));
  assert.ok(emittedEvents.includes("anchor_timing_refined"));
});

test("ambiguous matching degrades safely without mutating anchor", async () => {
  const fixture = createAnchorFixture();
  fixture.records.set("anchor_2", {
    ...(fixture.records.get("anchor_1") as TrackedAnchor),
    id: "anchor_2",
    label: "Netflix",
    normalizedLabel: "netflix"
  });

  const service = new AnchorGmailEnrichmentService({
    repository: fixture.repository,
    rolloutService: new AnchorTrackingRolloutService({
      env: {
        LCB_ANCHOR_STEP4_ENABLED: "true",
        LCB_ANCHOR_GMAIL_ENRICHMENT_ENABLED: "true"
      }
    }),
    emitAuditEvent: async () => null as never
  });

  const result = await service.enrichFromGmailSignal({
    userId: "user_1",
    signal: {
      obligationId: "obl_2",
      title: "Netflix",
      vendorName: "Netflix",
      obligationType: ObligationType.SUBSCRIPTION,
      dueDate: new Date("2026-04-27T00:00:00.000Z"),
      recurrence: "monthly",
      amount: null,
      currencyCode: null,
      confidenceScore: 0.86,
      source: "EMAIL",
      observedAt: new Date("2026-04-27T02:00:00.000Z")
    }
  });

  assert.equal(result.status, "AMBIGUOUS");
  const original = fixture.records.get("anchor_1");
  assert.equal(original?.linkedObligationId, null);
});

test("rollout disable cleanly skips enrichment", async () => {
  const fixture = createAnchorFixture();
  const service = new AnchorGmailEnrichmentService({
    repository: fixture.repository,
    rolloutService: new AnchorTrackingRolloutService({
      env: {
        LCB_ANCHOR_STEP4_ENABLED: "false"
      }
    }),
    emitAuditEvent: async () => null as never
  });

  const result = await service.enrichFromGmailSignal({
    userId: "user_1",
    signal: {
      obligationId: "obl_3",
      title: "Netflix",
      vendorName: "Netflix",
      obligationType: ObligationType.SUBSCRIPTION,
      dueDate: null,
      recurrence: null,
      amount: null,
      currencyCode: null,
      confidenceScore: 0.9,
      source: "EMAIL",
      observedAt: new Date("2026-04-27T02:00:00.000Z")
    }
  });

  assert.equal(result.status, "SKIPPED");
  assert.equal(result.reason, "ROLLOUT_DISABLED");
});

test("observed-at helper prefers message date over internal date", () => {
  const observed = toObservedAt({
    messageDate: "2026-04-10T00:00:00.000Z",
    internalDate: "2026-04-11T00:00:00.000Z",
    fallbackNow: new Date("2026-04-12T00:00:00.000Z")
  });

  assert.equal(observed.toISOString(), "2026-04-10T00:00:00.000Z");
});
