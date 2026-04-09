import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ALL_CLEAR_PROTECTION_BUTTON,
  ALL_CLEAR_PROTECTION_HEADLINE,
  ALL_CLEAR_PROTECTION_SUPPORTING,
  buildAllClearForecast,
  default as TodayEmptyState
} from "./today-empty-state";
import { ToastProvider } from "./ui/toast-provider";

function renderState(node: ReactNode) {
  return renderToStaticMarkup(<ToastProvider>{node}</ToastProvider>);
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

test("follow-up mode removes duplicate all-clear closure text", () => {
  const html = renderState(
    <TodayEmptyState
      mode="follow_up"
      headline="You're all set for now"
      subheadline="Nothing needs your attention today."
      viewUpcomingAvailable
    />
  );

  assert.equal(html.includes("Done for now"), false);
  assert.equal(countOccurrences(html, "You&#x27;re all set for now"), 0);
});

test("standalone mode still renders one clear closure heading", () => {
  const html = renderState(<TodayEmptyState />);
  assert.equal(countOccurrences(html, "You&#x27;re all set for now"), 1);
});

test("all-clear CTA copy is explicit and value-led", () => {
  const html = renderState(<TodayEmptyState mode="follow_up" />);
  const supportingEscaped = ALL_CLEAR_PROTECTION_SUPPORTING.replace(
    /'/g,
    "&#x27;"
  );

  assert.equal(html.includes(ALL_CLEAR_PROTECTION_HEADLINE), true);
  assert.equal(
    html.includes(ALL_CLEAR_PROTECTION_SUPPORTING) ||
      html.includes(supportingEscaped),
    true
  );
  assert.equal(html.includes(ALL_CLEAR_PROTECTION_BUTTON), true);
  assert.equal(html.includes("Want us to keep an eye on something?"), false);
  assert.equal(html.includes("What do you want us to keep an eye on?"), false);
  assert.equal(html.includes("What should we keep an eye on?"), false);
});

test("view upcoming is rendered after anchor CTA block to keep hierarchy calm", () => {
  const html = renderState(
    <TodayEmptyState mode="follow_up" viewUpcomingAvailable />
  );

  const ctaIndex = html.indexOf(ALL_CLEAR_PROTECTION_BUTTON);
  const upcomingIndex = html.indexOf("View upcoming");

  assert.ok(ctaIndex >= 0);
  assert.ok(upcomingIndex >= 0);
  assert.ok(upcomingIndex > ctaIndex);
});

test("passive forecast labels are hardened to concise calm copy", () => {
  const forecast = buildAllClearForecast({
    title: "Next 30 days look light",
    whenLabel: null,
    href: "/upcoming"
  });

  assert.equal(forecast.title, "Nothing heavy coming up");
  assert.equal(forecast.supporting, "The next few weeks look light.");
});
