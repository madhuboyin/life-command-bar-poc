import assert from "node:assert/strict";
import test from "node:test";
import {
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorStatus
} from "@prisma/client";
import { AnchorTrackingEngineService } from "./anchor-tracking-engine.service";

const FIXED_NOW = new Date("2026-04-08T12:00:00.000Z");

function createContext(
  input: Partial<{
    recurrenceType: AnchorRecurrenceType;
    recurrenceInterval: number | null;
    recurrenceUnit: AnchorRecurrenceUnit | null;
    nextExpectedDate: Date | null;
    expectedWindowStart: Date | null;
    expectedWindowEnd: Date | null;
    reminderLeadDays: number | null;
    lastSnoozedUntil: Date | null;
    status: AnchorStatus;
    confidence: AnchorConfidence;
  }> = {}
) {
  const has = <K extends keyof typeof input>(key: K) =>
    Object.prototype.hasOwnProperty.call(input, key);

  return {
    recurrenceType: input.recurrenceType ?? AnchorRecurrenceType.RECURRING,
    recurrenceInterval: has("recurrenceInterval")
      ? (input.recurrenceInterval as number | null)
      : 1,
    recurrenceUnit: has("recurrenceUnit")
      ? (input.recurrenceUnit as AnchorRecurrenceUnit | null)
      : AnchorRecurrenceUnit.MONTH,
    nextExpectedDate: has("nextExpectedDate")
      ? (input.nextExpectedDate as Date | null)
      : new Date("2026-05-01T00:00:00.000Z"),
    expectedWindowStart: has("expectedWindowStart")
      ? (input.expectedWindowStart as Date | null)
      : null,
    expectedWindowEnd: has("expectedWindowEnd")
      ? (input.expectedWindowEnd as Date | null)
      : null,
    reminderLeadDays: has("reminderLeadDays")
      ? (input.reminderLeadDays as number | null)
      : 4,
    lastSnoozedUntil: has("lastSnoozedUntil")
      ? (input.lastSnoozedUntil as Date | null)
      : null,
    status: input.status ?? AnchorStatus.ACTIVE,
    confidence: input.confidence ?? AnchorConfidence.USER_PROVIDED
  };
}

test("computeExpectedWindow uses recurrence + reminder lead for monthly anchors", () => {
  const service = new AnchorTrackingEngineService();
  const result = service.computeExpectedWindow(createContext(), FIXED_NOW);

  assert.equal(result.reason, "KNOWN_NEXT_EXPECTED_DATE");
  assert.equal(result.nextExpectedDate?.toISOString(), "2026-05-01T00:00:00.000Z");
  assert.equal(
    result.expectedWindowStart?.toISOString(),
    "2026-04-27T00:00:00.000Z"
  );
  assert.equal(result.expectedWindowEnd?.toISOString(), "2026-05-04T00:00:00.000Z");
});

test("computeExpectedWindow gives wider yearly window defaults", () => {
  const service = new AnchorTrackingEngineService();
  const result = service.computeExpectedWindow(
    createContext({
      recurrenceUnit: AnchorRecurrenceUnit.YEAR,
      reminderLeadDays: null,
      nextExpectedDate: new Date("2026-12-31T00:00:00.000Z")
    }),
    FIXED_NOW
  );

  assert.equal(result.expectedWindowStart?.toISOString(), "2026-12-10T00:00:00.000Z");
  assert.equal(result.expectedWindowEnd?.toISOString(), "2027-01-14T00:00:00.000Z");
});

test("one-time anchor with known date evaluates in window", () => {
  const service = new AnchorTrackingEngineService();
  const evaluation = service.evaluateAnchorDueStatus(
    createContext({
      recurrenceType: AnchorRecurrenceType.ONE_TIME,
      recurrenceInterval: null,
      recurrenceUnit: null,
      nextExpectedDate: new Date("2026-04-08T00:00:00.000Z")
    }),
    FIXED_NOW
  );

  assert.equal(evaluation.isEligibleForSurfacing, true);
  assert.equal(evaluation.reason, "IN_WINDOW");
});

test("unknown recurrence degrades safely with insufficient timing", () => {
  const service = new AnchorTrackingEngineService();
  const result = service.computeExpectedWindow(
    createContext({
      recurrenceType: AnchorRecurrenceType.UNKNOWN,
      recurrenceInterval: null,
      recurrenceUnit: null,
      nextExpectedDate: null
    }),
    FIXED_NOW
  );

  assert.equal(result.reason, "INSUFFICIENT_TIMING");
  assert.equal(result.nextExpectedDate, null);
  assert.equal(result.expectedWindowStart, null);
  assert.equal(result.expectedWindowEnd, null);
});

test("missing nextExpectedDate falls back for recurring timing without crashing", () => {
  const service = new AnchorTrackingEngineService();
  const result = service.computeExpectedWindow(
    createContext({
      recurrenceType: AnchorRecurrenceType.RECURRING,
      recurrenceInterval: 1,
      recurrenceUnit: AnchorRecurrenceUnit.MONTH,
      nextExpectedDate: null
    }),
    FIXED_NOW
  );

  assert.equal(result.reason, "RECURRING_FALLBACK");
  assert.equal(result.nextExpectedDate?.toISOString(), "2026-05-08T12:00:00.000Z");
  assert.equal(result.confidence, AnchorConfidence.SYSTEM_INFERRED);
});

test("advanceAnchorToNextCycle advances recurring anchors to a future cycle", () => {
  const service = new AnchorTrackingEngineService();
  const result = service.advanceAnchorToNextCycle(
    createContext({
      recurrenceType: AnchorRecurrenceType.RECURRING,
      recurrenceInterval: 1,
      recurrenceUnit: AnchorRecurrenceUnit.MONTH,
      nextExpectedDate: new Date("2026-05-01T00:00:00.000Z")
    }),
    new Date("2026-05-02T00:00:00.000Z")
  );

  assert.equal(result.advanced, true);
  assert.equal(result.reason, "ADVANCED");
  assert.equal(result.nextExpectedDate?.toISOString(), "2026-05-31T00:00:00.000Z");
});

test("due evaluation respects snooze and inactive status", () => {
  const service = new AnchorTrackingEngineService();
  const snoozed = service.evaluateAnchorDueStatus(
    createContext({
      lastSnoozedUntil: new Date("2026-04-09T00:00:00.000Z")
    }),
    FIXED_NOW
  );
  const inactive = service.evaluateAnchorDueStatus(
    createContext({
      status: AnchorStatus.PAUSED
    }),
    FIXED_NOW
  );

  assert.equal(snoozed.isEligibleForSurfacing, false);
  assert.equal(snoozed.reason, "SNOOZED");
  assert.equal(inactive.isEligibleForSurfacing, false);
  assert.equal(inactive.reason, "INACTIVE");
});
