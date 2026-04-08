"use client";

import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";

export default function DailyPulseEntryBanner() {
  return (
    <section style={cardStyles.bordered}>
      <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
        Daily Pulse
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
        Start with what matters
      </div>
      <div style={{ color: colors.textMuted, marginBottom: 12 }}>
        Review today&apos;s top decisions in one calm flow.
      </div>
      <Link href="/today" style={buttonStyles.link}>
        Open Today View
      </Link>
    </section>
  );
}
