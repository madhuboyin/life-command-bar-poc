import assert from "node:assert/strict";
import test from "node:test";
import {
  fromTrackedAnchorTodayItemId,
  toTrackedAnchorTodayItemId
} from "./tracked-anchor-today-id";

test("encodes and decodes tracked anchor today item ids", () => {
  const itemId = toTrackedAnchorTodayItemId("anchor_123");
  assert.equal(itemId, "tracked-anchor:anchor_123");
  assert.equal(fromTrackedAnchorTodayItemId(itemId), "anchor_123");
});

test("returns null for non-anchor today ids", () => {
  assert.equal(fromTrackedAnchorTodayItemId("obl_123"), null);
  assert.equal(fromTrackedAnchorTodayItemId("tracked-anchor:"), null);
});
