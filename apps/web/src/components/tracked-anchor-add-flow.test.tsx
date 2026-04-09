import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TrackedAnchorAddFlow, {
  TRACKED_ANCHOR_CATEGORY_OPTIONS,
  TRACKED_ANCHOR_FIRST_STEP_TITLE,
  TRACKED_ANCHOR_HELPER_COPY,
  TRACKED_ANCHOR_SECONDARY_INPUT_COPY,
  getTrackedAnchorStepTwoTitle,
  getTrackedAnchorSuggestions,
  isTrackedAnchorStepValid,
  nextTrackedAnchorStep,
  previousTrackedAnchorStep,
  type TrackedAnchorFormState
} from "./tracked-anchor-add-flow";
import { ToastProvider } from "./ui/toast-provider";

function renderOpenFlow() {
  return renderToStaticMarkup(
    <ToastProvider>
      <TrackedAnchorAddFlow defaultOpen triggerLabel="Track one more thing" />
    </ToastProvider>
  );
}

function containsEscaped(html: string, value: string) {
  return html.includes(value) || html.includes(value.replace(/'/g, "&#x27;"));
}

function createForm(overrides: Partial<TrackedAnchorFormState> = {}): TrackedAnchorFormState {
  return {
    label: "",
    category: null,
    cadence: "NOT_SURE",
    timing: "NOT_SURE",
    specificDate: "",
    ...overrides
  };
}

test("modal first step is category-first with updated copy", () => {
  const html = renderOpenFlow();

  assert.equal(containsEscaped(html, TRACKED_ANCHOR_FIRST_STEP_TITLE), true);
  assert.equal(containsEscaped(html, TRACKED_ANCHOR_SECONDARY_INPUT_COPY), true);
  assert.equal(containsEscaped(html, TRACKED_ANCHOR_HELPER_COPY), true);
  assert.equal(html.includes("What should we keep an eye on?"), false);
});

test("first step renders all category choices", () => {
  const html = renderOpenFlow();

  for (const option of TRACKED_ANCHOR_CATEGORY_OPTIONS) {
    assert.equal(html.includes(option.label), true);
  }
});

test("step-two title changes based on selected category", () => {
  assert.equal(getTrackedAnchorStepTwoTitle("SUBSCRIPTION"), "Which subscription?");
  assert.equal(getTrackedAnchorStepTwoTitle("BILL"), "Which bill?");
  assert.equal(
    getTrackedAnchorStepTwoTitle("RECURRING_PAYMENT"),
    "Which payment do you want help remembering?"
  );
  assert.equal(getTrackedAnchorStepTwoTitle("INSURANCE"), "Which insurance?");
  assert.equal(getTrackedAnchorStepTwoTitle("OTHER"), "What should we remind you about?");
});

test("category suggestions are returned for recognition-first step two", () => {
  const subscriptionSuggestions = getTrackedAnchorSuggestions("SUBSCRIPTION");

  assert.equal(subscriptionSuggestions.includes("Netflix"), true);
  assert.equal(subscriptionSuggestions.includes("Spotify"), true);
  assert.equal(getTrackedAnchorSuggestions(null).length, 0);
});

test("step validation keeps continue/back behavior safe", () => {
  const empty = createForm();
  const withCategory = createForm({ category: "BILL" });
  const withLabel = createForm({ label: "Water bill" });
  const dateMissing = createForm({ label: "Car insurance", timing: "SPECIFIC_DATE" });
  const dateReady = createForm({
    label: "Car insurance",
    timing: "SPECIFIC_DATE",
    specificDate: "2026-05-10"
  });

  assert.equal(isTrackedAnchorStepValid(1, empty), false);
  assert.equal(isTrackedAnchorStepValid(1, withCategory), true);
  assert.equal(isTrackedAnchorStepValid(1, withLabel), true);
  assert.equal(isTrackedAnchorStepValid(2, empty), false);
  assert.equal(isTrackedAnchorStepValid(2, withLabel), true);
  assert.equal(isTrackedAnchorStepValid(4, dateMissing), false);
  assert.equal(isTrackedAnchorStepValid(4, dateReady), true);

  assert.equal(nextTrackedAnchorStep(1), 2);
  assert.equal(nextTrackedAnchorStep(4), 4);
  assert.equal(previousTrackedAnchorStep(1), 1);
  assert.equal(previousTrackedAnchorStep(3), 2);
});
