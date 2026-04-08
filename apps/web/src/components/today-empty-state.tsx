"use client";

import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";

export default function TodayEmptyState() {
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: colors.textMuted }}>Today View</div>
      <h2 style={{ margin: 0, fontSize: 28 }}>You&apos;re done for now.</h2>
      <p style={{ margin: 0, color: colors.textMuted }}>
        Nothing urgent needs attention right now. You can check upcoming items or open Control Tower.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/upcoming" style={buttonStyles.link}>
          View upcoming
        </Link>
        <Link href="/control-tower" style={buttonStyles.link}>
          Open Control Tower
        </Link>
        <Link href="/focus" style={buttonStyles.link}>
          Start Focus Mode
        </Link>
      </div>
    </section>
  );
}
