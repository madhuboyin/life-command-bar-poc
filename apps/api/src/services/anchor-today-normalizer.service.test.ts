import assert from "node:assert/strict";
import test from "node:test";
import {
  AnchorCategory,
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorSource,
  AnchorStatus,
  type TrackedAnchor
} from "@prisma/client";
import { AnchorTodayNormalizerService } from "./anchor-today-normalizer.service";

const FIXED_NOW = new Date("2026-04-08T12:00:00.000Z");

function createAnchor(input: Partial<TrackedAnchor> = {}): TrackedAnchor {
  const hasOwn = <K extends keyof TrackedAnchor>(key: K) =>
    Object.prototype.hasOwnProperty.call(input, key);

  return {
    id: input.id ?? "anchor_1",
    userId: input.userId ?? "user_1",
    label: input.label ?? "Netflix",
    normalizedLabel: input.normalizedLabel ?? "netflix",
    category: input.category ?? AnchorCategory.SUBSCRIPTION,
    recurrenceType: input.recurrenceType ?? AnchorRecurrenceType.RECURRING,
    recurrenceInterval: input.recurrenceInterval ?? 1,
    recurrenceUnit: input.recurrenceUnit ?? AnchorRecurrenceUnit.MONTH,
    expectedAmount: input.expectedAmount ?? null,
    currencyCode: input.currencyCode ?? null,
    nextExpectedDate: hasOwn("nextExpectedDate")
      ? (input.nextExpectedDate ?? null)
      : new Date("2026-04-10T00:00:00.000Z"),
    expectedWindowStart: hasOwn("expectedWindowStart")
      ? (input.expectedWindowStart ?? null)
      : new Date("2026-04-06T00:00:00.000Z"),
    expectedWindowEnd: hasOwn("expectedWindowEnd")
      ? (input.expectedWindowEnd ?? null)
      : new Date("2026-04-13T00:00:00.000Z"),
    status: input.status ?? AnchorStatus.ACTIVE,
    source: input.source ?? AnchorSource.USER_ADDED,
    confidence: input.confidence ?? AnchorConfidence.USER_PROVIDED,
    notes: input.notes ?? null,
    reminderLeadDays: input.reminderLeadDays ?? 4,
    lastConfirmedAt: input.lastConfirmedAt ?? null,
    lastObservedAt: input.lastObservedAt ?? null,
    lastSurfacedAt: input.lastSurfacedAt ?? null,
    lastSnoozedUntil: input.lastSnoozedUntil ?? null,
    vendorId: input.vendorId ?? null,
    linkedObligationId: input.linkedObligationId ?? null,
    createdAt: input.createdAt ?? new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-03-02T00:00:00.000Z")
  };
}

test("normalizes eligible anchors into tracked candidates", () => {
  const normalizer = new AnchorTodayNormalizerService();
  const [candidate] = normalizer.normalizeAnchorsForToday({
    anchors: [createAnchor()],
    now: FIXED_NOW
  });

  assert.ok(candidate);
  assert.equal(candidate.candidate.itemType, "TRACKED_ANCHOR");
  assert.equal(candidate.candidate.trackedAnchor?.dueReason, "IN_WINDOW");
  assert.equal(candidate.candidate.sourceSummary, "You asked us to keep an eye on this.");
  assert.equal(candidate.candidate.priorityHintScore === undefined, false);
});

test("suppresses snoozed and inactive anchors", () => {
  const normalizer = new AnchorTodayNormalizerService();
  const results = normalizer.normalizeAnchorsForToday({
    anchors: [
      createAnchor({
        id: "snoozed",
        lastSnoozedUntil: new Date("2026-04-11T00:00:00.000Z")
      }),
      createAnchor({
        id: "paused",
        status: AnchorStatus.PAUSED
      }),
      createAnchor({
        id: "cancelled",
        status: AnchorStatus.CANCELLED
      })
    ],
    now: FIXED_NOW
  });

  assert.equal(results.length, 0);
});

test("weak timing anchors surface conservatively after cooldown", () => {
  const normalizer = new AnchorTodayNormalizerService();

  const fresh = normalizer.normalizeAnchorsForToday({
    anchors: [
      createAnchor({
        id: "fresh",
        recurrenceType: AnchorRecurrenceType.UNKNOWN,
        recurrenceInterval: null,
        recurrenceUnit: null,
        nextExpectedDate: null,
        expectedWindowStart: null,
        expectedWindowEnd: null,
        createdAt: new Date("2026-04-05T00:00:00.000Z")
      })
    ],
    now: FIXED_NOW
  });
  assert.equal(fresh.length, 0);

  const old = normalizer.normalizeAnchorsForToday({
    anchors: [
      createAnchor({
        id: "old",
        recurrenceType: AnchorRecurrenceType.UNKNOWN,
        recurrenceInterval: null,
        recurrenceUnit: null,
        nextExpectedDate: null,
        expectedWindowStart: null,
        expectedWindowEnd: null,
        createdAt: new Date("2026-03-01T00:00:00.000Z")
      })
    ],
    now: FIXED_NOW
  });

  assert.equal(old.length, 1);
  assert.equal(old[0]?.dueEvaluation.reason, "INSUFFICIENT_TIMING");
});

test("suppresses anchor candidates that overlap known open obligations", () => {
  const normalizer = new AnchorTodayNormalizerService();
  const results = normalizer.normalizeAnchorsForToday({
    anchors: [createAnchor({ label: "Netflix Premium", normalizedLabel: "netflix premium" })],
    suppressionKeys: new Set(["netflix premium"]),
    now: FIXED_NOW
  });

  assert.equal(results.length, 0);
});

test("suppresses anchor candidates by explicit dedupe anchor ids", () => {
  const normalizer = new AnchorTodayNormalizerService();
  const results = normalizer.normalizeAnchorsForToday({
    anchors: [createAnchor({ id: "anchor_suppressed" })],
    suppressedAnchorIds: new Set(["anchor_suppressed"]),
    now: FIXED_NOW
  });

  assert.equal(results.length, 0);
});
