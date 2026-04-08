import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTodayLoopModel,
  type TodayLoopItem
} from "./today-loop-state";

const FIXED_NOW = new Date("2026-04-08T12:00:00.000Z");

function createItem(input: Partial<TodayLoopItem> = {}): TodayLoopItem {
  return {
    id: input.id ?? "item_1",
    title: input.title ?? "Netflix renewal",
    subtitle: input.subtitle ?? null,
    dueDate: input.dueDate ?? null,
    renewalDate: input.renewalDate ?? null,
    confidenceBand: input.confidenceBand ?? "HIGH",
    primaryAction: input.primaryAction ?? {
      key: "MARK_DONE",
      href: "/obligations/item_1"
    }
  };
}

test("returns CLEAR state with done-for-now copy when no actionable items", () => {
  const model = buildTodayLoopModel({
    actionableItems: [],
    upcomingItems: [
      createItem({
        id: "next",
        title: "Xfinity bill",
        dueDate: "2026-04-10T00:00:00.000Z",
        primaryAction: {
          key: "VIEW_DETAILS",
          href: "/upcoming"
        }
      })
    ],
    now: FIXED_NOW
  });

  assert.equal(model.todayState, "CLEAR");
  assert.equal(model.headline, "You're all set for now");
  assert.equal(model.subheadline, "Nothing needs your attention today.");
  assert.equal(model.primaryItem, null);
  assert.equal(model.totalActionableCount, 0);
  assert.equal(model.nextUp?.title, "Xfinity bill");
  assert.equal(model.nextUp?.whenLabel, "in 2 days");
});

test("returns ONE_ITEM state with a single primary card", () => {
  const model = buildTodayLoopModel({
    actionableItems: [
      createItem({
        id: "only",
        title: "Car insurance",
        dueDate: "2026-04-09T00:00:00.000Z"
      })
    ],
    upcomingItems: [],
    now: FIXED_NOW
  });

  assert.equal(model.todayState, "ONE_ITEM");
  assert.equal(model.headline, "1 thing needs attention");
  assert.equal(model.primaryItem?.id, "only");
  assert.equal(model.queuedItems.length, 0);
  assert.equal(model.totalActionableCount, 1);
});

test("returns FEW_ITEMS state and keeps one-at-a-time queue semantics", () => {
  const model = buildTodayLoopModel({
    actionableItems: [
      createItem({ id: "one", title: "Internet bill" }),
      createItem({ id: "two", title: "Gym renewal" }),
      createItem({ id: "three", title: "Trash service" }),
      createItem({ id: "four", title: "Extra item" })
    ],
    upcomingItems: [],
    now: FIXED_NOW
  });

  assert.equal(model.todayState, "FEW_ITEMS");
  assert.equal(model.primaryItem?.id, "one");
  assert.deepEqual(
    model.queuedItems.map((item) => item.id),
    ["two", "three"]
  );
  assert.equal(model.totalActionableCount, 3);
});

test("returns REVIEW_NEEDED state for low-confidence review-first items", () => {
  const model = buildTodayLoopModel({
    actionableItems: [
      createItem({
        id: "review_one",
        confidenceBand: "LOW",
        primaryAction: {
          key: "REVIEW",
          href: "/obligations/review_one/review"
        }
      })
    ],
    upcomingItems: [],
    now: FIXED_NOW
  });

  assert.equal(model.todayState, "REVIEW_NEEDED");
  assert.equal(model.headline, "Something may need a quick look");
  assert.equal(model.subheadline, "We're not fully sure yet.");
});
