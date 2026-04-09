"use client";

import Link from "next/link";
import type { TodayNextUp } from "../lib/types";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import { buildCompletionReliefMessage } from "../lib/emotional-trust.service";
import TrackedAnchorAddFlow from "./tracked-anchor-add-flow";

export default function TodayEmptyState({
  headline = "You're all set for now",
  subheadline = "Nothing needs your attention today.",
  nextUp,
  viewUpcomingAvailable
}: {
  headline?: string;
  subheadline?: string;
  nextUp?: TodayNextUp | null;
  viewUpcomingAvailable?: boolean;
}) {
  const relief = buildCompletionReliefMessage();
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: colors.textMuted }}>Done for now</div>
      <h2 style={{ margin: 0, fontSize: 30 }}>{headline}</h2>
      <p style={{ margin: 0, color: colors.textMuted }}>
        {subheadline || relief.supporting || "Nothing urgent right now."}
      </p>
      {nextUp ? (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 12,
            background: colors.surfaceMuted
          }}
        >
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
            Next thing coming up
          </div>
          <div style={{ fontWeight: 700 }}>{nextUp.title}</div>
          <div style={{ color: colors.textMuted, fontSize: 13 }}>
            {nextUp.whenLabel ? `Likely ${nextUp.whenLabel}.` : "Worth a quick look later."}
          </div>
        </div>
      ) : null}
      {viewUpcomingAvailable ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/upcoming" style={buttonStyles.link}>
            View upcoming
          </Link>
          <TrackedAnchorAddFlow
            triggerLabel="Want us to keep an eye on something?"
            triggerStyle="secondary"
            headline="What do you want us to keep an eye on?"
          />
        </div>
      ) : (
        <TrackedAnchorAddFlow
          triggerLabel="Want us to keep an eye on something?"
          triggerStyle="secondary"
          headline="What do you want us to keep an eye on?"
        />
      )}
    </section>
  );
}
