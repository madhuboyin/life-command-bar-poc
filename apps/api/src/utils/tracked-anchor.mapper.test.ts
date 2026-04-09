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
import {
  buildTrackedAnchorCreateSuccess,
  mapTrackedAnchor
} from "./tracked-anchor.mapper";

function createAnchor(
  input: Partial<TrackedAnchor> = {}
): TrackedAnchor {
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
      : new Date("2026-05-01T00:00:00.000Z"),
    expectedWindowStart: hasOwn("expectedWindowStart")
      ? (input.expectedWindowStart ?? null)
      : new Date("2026-04-27T00:00:00.000Z"),
    expectedWindowEnd: hasOwn("expectedWindowEnd")
      ? (input.expectedWindowEnd ?? null)
      : new Date("2026-05-04T00:00:00.000Z"),
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
    createdAt: input.createdAt ?? new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-04-02T00:00:00.000Z")
  };
}

test("mapTrackedAnchor returns user-safe summary fields", () => {
  const mapped = mapTrackedAnchor(createAnchor());
  assert.equal(mapped.statusLabel, "Watching");
  assert.equal(mapped.cadenceLabel, "Monthly");
  assert.match(mapped.timingSummary ?? "", /Likely around/i);
  assert.deepEqual(mapped.availableActions, [
    "EDIT",
    "PAUSE",
    "SNOOZE",
    "CANCEL",
    "ARCHIVE"
  ]);
});

test("create success copy avoids internal jargon and reassures user", () => {
  const success = buildTrackedAnchorCreateSuccess(createAnchor());
  assert.match(success.title, /keep an eye on/i);
  assert.match(success.description, /remind you before/i);
  assert.match(success.reassurance, /don't have to keep this in your head/i);
});

test("unknown timing returns soft timing summary", () => {
  const mapped = mapTrackedAnchor(
    createAnchor({
      recurrenceType: AnchorRecurrenceType.UNKNOWN,
      recurrenceUnit: null,
      recurrenceInterval: null,
      nextExpectedDate: null,
      expectedWindowStart: null,
      expectedWindowEnd: null
    })
  );
  assert.equal(mapped.cadenceLabel, "Not sure yet");
  assert.equal(mapped.timingSummary, "We'll keep watching and learn the timing");
});
