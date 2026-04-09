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
import {
  evaluateAnchorObligationMatch,
  inferRecurrenceFromText
} from "./anchor-obligation-match.service";

function createAnchor(overrides: Partial<TrackedAnchor> = {}): TrackedAnchor {
  return {
    id: overrides.id ?? "anchor_1",
    userId: overrides.userId ?? "user_1",
    label: overrides.label ?? "Netflix",
    normalizedLabel: overrides.normalizedLabel ?? "netflix",
    category: overrides.category ?? AnchorCategory.SUBSCRIPTION,
    recurrenceType: overrides.recurrenceType ?? AnchorRecurrenceType.RECURRING,
    recurrenceInterval: overrides.recurrenceInterval ?? 1,
    recurrenceUnit: overrides.recurrenceUnit ?? AnchorRecurrenceUnit.MONTH,
    expectedAmount: overrides.expectedAmount ?? null,
    currencyCode: overrides.currencyCode ?? null,
    nextExpectedDate:
      overrides.nextExpectedDate ?? new Date("2026-05-01T00:00:00.000Z"),
    expectedWindowStart:
      overrides.expectedWindowStart ?? new Date("2026-04-27T00:00:00.000Z"),
    expectedWindowEnd:
      overrides.expectedWindowEnd ?? new Date("2026-05-04T00:00:00.000Z"),
    status: overrides.status ?? AnchorStatus.ACTIVE,
    source: overrides.source ?? AnchorSource.USER_ADDED,
    confidence: overrides.confidence ?? AnchorConfidence.USER_PROVIDED,
    notes: overrides.notes ?? null,
    reminderLeadDays: overrides.reminderLeadDays ?? 4,
    lastConfirmedAt: overrides.lastConfirmedAt ?? null,
    lastObservedAt: overrides.lastObservedAt ?? null,
    lastSurfacedAt: overrides.lastSurfacedAt ?? null,
    lastSnoozedUntil: overrides.lastSnoozedUntil ?? null,
    vendorId: overrides.vendorId ?? null,
    linkedObligationId: overrides.linkedObligationId ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00.000Z")
  };
}

test("strong matches require meaningful label alignment", () => {
  const anchor = createAnchor();
  const match = evaluateAnchorObligationMatch(anchor, {
    obligationId: "obl_1",
    title: "Netflix monthly charge",
    vendorName: "Netflix",
    obligationType: ObligationType.SUBSCRIPTION,
    dueDate: new Date("2026-05-02T00:00:00.000Z"),
    recurrence: "monthly",
    amount: null,
    currencyCode: null,
    confidenceScore: 0.9,
    source: "EMAIL"
  });

  assert.equal(match.strength, "STRONG");
  assert.ok(match.score >= 0.76);
});

test("weak keyword overlap degrades safely to no match", () => {
  const anchor = createAnchor({ label: "Gym membership", normalizedLabel: "gym membership" });
  const match = evaluateAnchorObligationMatch(anchor, {
    obligationId: "obl_2",
    title: "General monthly update",
    vendorName: "Monthly Services",
    obligationType: ObligationType.SUBSCRIPTION,
    dueDate: new Date("2026-05-03T00:00:00.000Z"),
    recurrence: "monthly",
    amount: null,
    currencyCode: null,
    confidenceScore: 0.8,
    source: "EMAIL"
  });

  assert.equal(match.strength, "NONE");
});

test("linked obligation id is always treated as a strong match", () => {
  const anchor = createAnchor({ linkedObligationId: "obl_linked" });
  const match = evaluateAnchorObligationMatch(anchor, {
    obligationId: "obl_linked",
    title: "Anything",
    vendorName: "Anything",
    obligationType: ObligationType.BILL,
    dueDate: null,
    recurrence: null,
    amount: null,
    currencyCode: null,
    confidenceScore: 0.4,
    source: "INFERRED"
  });

  assert.equal(match.strength, "STRONG");
  assert.equal(match.linkedObligationMatch, true);
});

test("recurrence text inference stays deterministic for common cadences", () => {
  const monthly = inferRecurrenceFromText("monthly");
  assert.equal(monthly.recurrenceType, AnchorRecurrenceType.RECURRING);
  assert.equal(monthly.recurrenceUnit, AnchorRecurrenceUnit.MONTH);

  const yearly = inferRecurrenceFromText("annual plan");
  assert.equal(yearly.recurrenceType, AnchorRecurrenceType.RECURRING);
  assert.equal(yearly.recurrenceUnit, AnchorRecurrenceUnit.YEAR);

  const unknown = inferRecurrenceFromText(null);
  assert.equal(unknown.recurrenceType, AnchorRecurrenceType.UNKNOWN);
});
