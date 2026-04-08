import assert from "node:assert/strict";
import test from "node:test";
import { PersonalizationSignalService } from "./personalization-signal.service";

test("summarizeBehaviorSignals returns deterministic empty summary scaffold", async () => {
  const service = new PersonalizationSignalService();
  const start = new Date("2026-02-01T00:00:00.000Z");
  const end = new Date("2026-02-02T00:00:00.000Z");

  const summary = await service.summarizeBehaviorSignals({
    userId: "user_signal",
    windowStart: start,
    windowEnd: end
  });

  assert.equal(summary.userId, "user_signal");
  assert.equal(summary.sampleSize, 0);
  assert.equal(summary.signals.totalImpressions, 0);
  assert.equal(summary.signals.totalActions, 0);
  assert.equal(summary.signals.totalDefers, 0);
  assert.equal(summary.windowStart?.toISOString(), start.toISOString());
  assert.equal(summary.windowEnd?.toISOString(), end.toISOString());
});
