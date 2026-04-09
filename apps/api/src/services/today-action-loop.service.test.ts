import assert from "node:assert/strict";
import test from "node:test";
import { deriveTrackedAnchorActionPlan } from "./today-action-loop.service";

const FIXED_NOW = new Date("2026-04-08T12:00:00.000Z");

test("tracked anchor MARK_DONE resolves to confirm/advance plan", () => {
  const plan = deriveTrackedAnchorActionPlan({
    actionKey: "MARK_DONE",
    remindAt: null,
    now: FIXED_NOW
  });

  assert.equal(plan.kind, "CONFIRM_AND_ADVANCE");
});

test("tracked anchor REMIND_LATER uses explicit remindAt when provided", () => {
  const plan = deriveTrackedAnchorActionPlan({
    actionKey: "REMIND_LATER",
    remindAt: "2026-04-20T09:00:00.000Z",
    now: FIXED_NOW
  });

  assert.equal(plan.kind, "SNOOZE");
  if (plan.kind === "SNOOZE") {
    assert.equal(plan.until.toISOString(), "2026-04-20T09:00:00.000Z");
  }
});

test("tracked anchor REMIND_LATER defaults to a one-week snooze", () => {
  const plan = deriveTrackedAnchorActionPlan({
    actionKey: "REMIND_LATER",
    remindAt: null,
    now: FIXED_NOW
  });

  assert.equal(plan.kind, "SNOOZE");
  if (plan.kind === "SNOOZE") {
    assert.equal(plan.until.toISOString(), "2026-04-15T12:00:00.000Z");
  }
});

test("tracked anchor DISMISS maps to cancel", () => {
  const plan = deriveTrackedAnchorActionPlan({
    actionKey: "DISMISS",
    remindAt: null,
    now: FIXED_NOW
  });

  assert.equal(plan.kind, "CANCEL");
});
