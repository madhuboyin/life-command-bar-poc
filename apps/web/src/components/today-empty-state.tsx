"use client";

import React from "react";
import Link from "next/link";
import type { TodayNextUp } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import TrackedAnchorAddFlow from "./tracked-anchor-add-flow";

export const ALL_CLEAR_PROTECTION_HEADLINE = "Never miss a renewal or bill again";
export const ALL_CLEAR_PROTECTION_SUPPORTING =
  "Add one thing and we'll remind you before it comes up.";
export const ALL_CLEAR_PROTECTION_BUTTON = "Add something to track";

type TodayEmptyStateMode = "standalone" | "follow_up";

export default function TodayEmptyState({
  headline = "You're all set for now",
  subheadline = "Nothing needs your attention today.",
  nextUp,
  viewUpcomingAvailable,
  mode = "standalone"
}: {
  headline?: string;
  subheadline?: string;
  nextUp?: TodayNextUp | null;
  viewUpcomingAvailable?: boolean;
  mode?: TodayEmptyStateMode;
}) {
  const forecast = buildAllClearForecast(nextUp);

  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 12 }}>
      {mode === "standalone" ? (
        <>
          <div style={{ fontSize: 12, color: colors.textMuted }}>Done for now</div>
          <h2 style={{ margin: 0, fontSize: 30 }}>{headline}</h2>
          <p style={{ margin: 0, color: colors.textMuted }}>
            {subheadline || "Nothing needs your attention today."}
          </p>
        </>
      ) : null}

      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 12,
          background: colors.surfaceMuted
        }}
      >
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
          {forecast.eyebrow}
        </div>
        <div style={{ fontWeight: 700 }}>{forecast.title}</div>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>{forecast.supporting}</div>
      </div>

      <div
        style={{
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: 12,
          padding: 14,
          background: colors.surface
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 20 }}>{ALL_CLEAR_PROTECTION_HEADLINE}</h3>
          <p style={{ margin: 0, color: colors.textMuted }}>
            {ALL_CLEAR_PROTECTION_SUPPORTING}
          </p>
          <div style={{ marginTop: 2 }}>
            <TrackedAnchorAddFlow
              triggerLabel={ALL_CLEAR_PROTECTION_BUTTON}
              triggerStyle="primary"
              headline="What should we keep an eye on?"
            />
          </div>
        </div>
      </div>

      {viewUpcomingAvailable ? (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start"
          }}
        >
          <Link
            href="/upcoming"
            style={{
              ...buttonStyles.link,
              border: "none",
              background: "transparent",
              color: colors.textMuted,
              padding: "4px 0",
              fontWeight: 500
            }}
          >
            View upcoming
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export function buildAllClearForecast(nextUp?: TodayNextUp | null) {
  if (!nextUp || isPassiveForecastLabel(nextUp.title)) {
    return {
      eyebrow: "Coming up",
      title: "Nothing heavy coming up",
      supporting: "The next few weeks look light."
    };
  }

  return {
    eyebrow: "Next thing coming up",
    title: nextUp.title,
    supporting: nextUp.whenLabel
      ? `Likely ${nextUp.whenLabel}.`
      : "Worth a quick look later."
  };
}

function isPassiveForecastLabel(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    normalized.includes("next 30 days look light") ||
    normalized.includes("look light") ||
    normalized.includes("nothing heavy")
  );
}
