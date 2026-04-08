"use client";

import Link from "next/link";
import { buttonStyles, cardStyles, colors } from "../lib/ui";
import {
  buildActionLabel,
  buildEmptyStateMessage
} from "../lib/human-language.service";
import { buildCompletionReliefMessage } from "../lib/emotional-trust.service";

export default function TodayEmptyState() {
  const message = buildEmptyStateMessage("today");
  const relief = buildCompletionReliefMessage();
  return (
    <section style={{ ...cardStyles.section, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: colors.textMuted }}>Today View</div>
      <h2 style={{ margin: 0, fontSize: 28 }}>{relief.primary}</h2>
      <p style={{ margin: 0, color: colors.textMuted }}>
        {relief.supporting ?? message.context ?? "Nothing urgent needs attention right now."}
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/upcoming" style={buttonStyles.link}>
          {buildActionLabel("details")}
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
