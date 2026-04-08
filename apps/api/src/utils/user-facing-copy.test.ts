import assert from "node:assert/strict";
import test from "node:test";
import { ok } from "./api-response";
import {
  containsBannedUserJargon,
  hardenUserFacingCopy,
  hardenUserFacingResponseData
} from "./user-facing-copy";

test("hardenUserFacingCopy replaces dense system jargon", () => {
  const input = "No dense admin cluster is expected in this window.";
  const output = hardenUserFacingCopy(input);
  assert.equal(output, "Nothing heavy is coming up in this window.");
});

test("containsBannedUserJargon detects blocked phrase families", () => {
  assert.equal(containsBannedUserJargon("No dense admin cluster today."), true);
  assert.equal(containsBannedUserJargon("Nothing urgent right now."), false);
});

test("hardenUserFacingResponseData updates user-facing fields and preserves structural keys", () => {
  const payload = {
    title: "Upcoming signal",
    description: "No high-risk signals detected. Keep monitoring lifecycle updates.",
    eventType: "subscription_lifecycle_transitioned",
    sourceSignals: ["low_confidence", "recent_activity"],
    metadata: {
      reason: "signal_conflict_detected"
    }
  };

  const hardened = hardenUserFacingResponseData(payload);
  assert.equal(hardened.title, "Upcoming item");
  assert.equal(hardened.description, "Nothing risky stands out. Keep monitoring status updates.");
  assert.equal(hardened.eventType, "subscription_lifecycle_transitioned");
  assert.deepEqual(hardened.sourceSignals, ["low confidence", "recent activity"]);
  assert.equal(hardened.metadata.reason, "signal_conflict_detected");
});

test("ok response helper hardens outgoing user-facing copy", () => {
  const response = createResponseDouble();

  ok(response as any, {
    title: "No strong upcoming signals",
    description: "As patterns stabilize, this area will show what is likely coming next."
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload?.success, true);
  assert.equal(response.payload?.data?.title, "No strong upcoming items");
  assert.equal(
    response.payload?.data?.description,
    "As things settle, this area will show what is likely coming next."
  );
});

function createResponseDouble() {
  type ApiResponsePayload = {
    success?: boolean;
    data?: {
      title?: string;
      description?: string;
    };
  };

  return {
    statusCode: 0,
    payload: null as ApiResponsePayload | null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: ApiResponsePayload) {
      this.payload = payload;
      return this;
    }
  };
}
