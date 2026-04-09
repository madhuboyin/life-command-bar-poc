import assert from "node:assert/strict";
import test from "node:test";
import {
  AnchorCategory,
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorSource,
  AnchorStatus,
  ImportSourceSubtype,
  ObligationType,
  type TrackedAnchor
} from "@prisma/client";
import { AnchorCandidateDedupeService } from "./anchor-candidate-dedupe.service";

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

test("suppresses anchor when Gmail candidate is strongly matched and concrete", () => {
  const service = new AnchorCandidateDedupeService();
  const plan = service.buildSuppressionPlan({
    anchors: [createAnchor()],
    obligations: [
      {
        obligationId: "obl_1",
        title: "Netflix monthly renewal",
        vendorName: "Netflix",
        obligationType: ObligationType.SUBSCRIPTION,
        dueDate: new Date("2026-05-02T00:00:00.000Z"),
        renewalDate: null,
        recurrence: "monthly",
        amount: null,
        currencyCode: null,
        confidenceScore: 0.91,
        sourceType: "EMAIL",
        importSourceSubtype: ImportSourceSubtype.GMAIL_READONLY
      }
    ],
    now: new Date("2026-04-08T00:00:00.000Z")
  });

  assert.equal(plan.suppressedAnchorIds.has("anchor_1"), true);
  assert.equal(
    plan.decisions.some(
      (decision) => decision.decision === "SUPPRESSED_IN_FAVOR_OF_GMAIL"
    ),
    true
  );
});

test("keeps anchor when matching Gmail signal is too weak", () => {
  const service = new AnchorCandidateDedupeService();
  const plan = service.buildSuppressionPlan({
    anchors: [createAnchor({ label: "Gym", normalizedLabel: "gym" })],
    obligations: [
      {
        obligationId: "obl_weak",
        title: "Monthly account summary",
        vendorName: "Service account",
        obligationType: ObligationType.SUBSCRIPTION,
        dueDate: new Date("2026-06-01T00:00:00.000Z"),
        renewalDate: null,
        recurrence: "monthly",
        amount: null,
        currencyCode: null,
        confidenceScore: 0.72,
        sourceType: "EMAIL",
        importSourceSubtype: ImportSourceSubtype.GMAIL_READONLY
      }
    ],
    now: new Date("2026-04-08T00:00:00.000Z")
  });

  assert.equal(plan.suppressedAnchorIds.size, 0);
});

test("flags ambiguous close matches instead of suppressing aggressively", () => {
  const service = new AnchorCandidateDedupeService();
  const plan = service.buildSuppressionPlan({
    anchors: [createAnchor({ label: "Netflix", normalizedLabel: "netflix" })],
    obligations: [
      {
        obligationId: "obl_1",
        title: "Netflix monthly renewal",
        vendorName: "Netflix",
        obligationType: ObligationType.SUBSCRIPTION,
        dueDate: new Date("2026-05-01T00:00:00.000Z"),
        renewalDate: null,
        recurrence: "monthly",
        amount: null,
        currencyCode: null,
        confidenceScore: 0.89,
        sourceType: "EMAIL",
        importSourceSubtype: ImportSourceSubtype.GMAIL_READONLY
      },
      {
        obligationId: "obl_2",
        title: "Netflix billing notice",
        vendorName: "Netflix Inc",
        obligationType: ObligationType.SUBSCRIPTION,
        dueDate: new Date("2026-05-02T00:00:00.000Z"),
        renewalDate: null,
        recurrence: "monthly",
        amount: null,
        currencyCode: null,
        confidenceScore: 0.88,
        sourceType: "EMAIL",
        importSourceSubtype: ImportSourceSubtype.GMAIL_READONLY
      }
    ],
    now: new Date("2026-04-08T00:00:00.000Z")
  });

  assert.equal(plan.suppressedAnchorIds.size, 0);
  assert.equal(
    plan.decisions.some((decision) => decision.decision === "AMBIGUOUS"),
    true
  );
});
