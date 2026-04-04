"use client";

import Link from "next/link";
import type { FocusSessionItem } from "../lib/types";
import { buttonStyles, cardStyles, colors, formatDateTime } from "../lib/ui";
import ConfidenceBadge from "./confidence-badge";
import SourceBadge from "./source-badge";

type Props = {
  item: FocusSessionItem;
  loadingAction: string | null;
  onStartGuided: () => Promise<void>;
  onComplete: () => Promise<void>;
  onPostpone: () => Promise<void>;
  onDismiss: () => Promise<void>;
  onSkip: () => Promise<void>;
};

export default function FocusSessionItemCard({
  item,
  loadingAction,
  onStartGuided,
  onComplete,
  onPostpone,
  onDismiss,
  onSkip
}: Props) {
  const isBusy = loadingAction !== null;

  return (
    <article style={cardStyles.section}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <SourceBadge sourceType={item.sourceType} />
        <ConfidenceBadge
          confidenceBand={item.confidenceBand}
          needsReview={item.needsReview}
        />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 12,
            fontWeight: 700,
            background: "#e5e7eb",
            color: "#374151"
          }}
        >
          ~{item.estimatedMinutes} min
        </span>
      </div>

      <h2 style={{ margin: "0 0 6px 0", fontSize: 24 }}>{item.title}</h2>
      <div style={{ color: colors.textMuted, marginBottom: 6 }}>
        {item.whyIncluded}
      </div>
      <div style={{ color: colors.textMuted, marginBottom: 12, fontSize: 13 }}>
        Due: {formatDateTime(item.obligation.dueDate)}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, max-content))",
          gap: 10
        }}
      >
        <button
          type="button"
          onClick={() => void onStartGuided()}
          disabled={isBusy}
          style={buttonStyles.primary}
        >
          {loadingAction === "guided" ? "Opening..." : "Start guided flow"}
        </button>

        <button
          type="button"
          onClick={() => void onComplete()}
          disabled={isBusy}
          style={buttonStyles.secondary}
        >
          {loadingAction === "complete" ? "Saving..." : "Complete now"}
        </button>

        <button
          type="button"
          onClick={() => void onPostpone()}
          disabled={isBusy}
          style={buttonStyles.secondary}
        >
          {loadingAction === "postpone" ? "Saving..." : "Postpone"}
        </button>

        <button
          type="button"
          onClick={() => void onSkip()}
          disabled={isBusy}
          style={buttonStyles.secondary}
        >
          {loadingAction === "skip" ? "Saving..." : "Skip"}
        </button>

        <button
          type="button"
          onClick={() => void onDismiss()}
          disabled={isBusy}
          style={buttonStyles.danger}
        >
          {loadingAction === "dismiss" ? "Saving..." : "Dismiss"}
        </button>

        <Link href={`/obligations/${item.obligationId}`} style={buttonStyles.link}>
          Review details
        </Link>
      </div>
    </article>
  );
}
