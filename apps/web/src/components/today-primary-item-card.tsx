"use client";

import type { DailyCommandCenterItem, TodayActionKey } from "../lib/types";
import { cardStyles, colors, formatDateTime } from "../lib/ui";
import TodayActionBar from "./today-action-bar";

export default function TodayPrimaryItemCard({
  item,
  loading,
  onAction
}: {
  item: DailyCommandCenterItem;
  loading: TodayActionKey | null;
  onAction: (itemId: string, actionKey: TodayActionKey) => Promise<void>;
}) {
  return (
    <article style={{ ...cardStyles.item, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: "0 0 6px 0", fontSize: 20 }}>{item.title}</h3>
          {item.subtitle ? <div style={{ color: colors.textMuted }}>{item.subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignSelf: "flex-start" }}>
          <PriorityBadge band={item.priorityBand} />
          <Tag label={item.category.replace(/_/g, " ")} />
          <Tag label={`Confidence ${item.confidenceBand.toLowerCase()}`} />
          <ScopeBadge item={item} />
        </div>
      </div>

      {item.amount !== null ? (
        <div style={{ fontSize: 14 }}>
          <strong>Amount:</strong> {formatMoney(item.amount, item.currency)}
        </div>
      ) : null}

      {item.dueDate || item.renewalDate ? (
        <div style={{ color: colors.textMuted, fontSize: 13 }}>
          {item.dueDate ? `Due ${formatDateTime(item.dueDate)}` : null}
          {item.dueDate && item.renewalDate ? " · " : null}
          {item.renewalDate ? `Renews ${formatDateTime(item.renewalDate)}` : null}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 6 }}>
        <div>
          <strong>Why now:</strong> {item.whyNow}
        </div>
        <div>
          <strong>Why this matters:</strong> {item.whyThisMatters}
        </div>
        <div style={{ color: colors.textMuted, fontSize: 13 }}>{item.sourceSummary}</div>
      </div>

      <TodayActionBar
        item={item}
        loading={loading}
        onAction={(actionKey) => onAction(item.id, actionKey)}
      />
    </article>
  );
}

function PriorityBadge({ band }: { band: DailyCommandCenterItem["priorityBand"] }) {
  const colorMap = {
    URGENT: { bg: "#fee2e2", text: "#991b1b" },
    HIGH: { bg: "#fef3c7", text: "#92400e" },
    MEDIUM: { bg: "#e0f2fe", text: "#0c4a6e" },
    LOW: { bg: "#f3f4f6", text: "#374151" }
  } as const;

  const color = colorMap[band];
  return (
    <span
      style={{
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 700,
        background: color.bg,
        color: color.text
      }}
    >
      {band.toLowerCase()}
    </span>
  );
}

function ScopeBadge({ item }: { item: DailyCommandCenterItem }) {
  if (item.scopeType === "PERSONAL") {
    return <Tag label="Personal" />;
  }

  if (!item.assignee) {
    return <Tag label="Household unassigned" />;
  }

  const name = item.assignee.name ?? item.assignee.email;
  return <Tag label={`Assigned ${name}`} />;
}

function Tag({ label }: { label: string }) {
  return (
    <span
      style={{
        borderRadius: 999,
        border: `1px solid ${colors.border}`,
        padding: "3px 10px",
        fontSize: 12,
        color: colors.textMuted,
        background: colors.surface
      }}
    >
      {label}
    </span>
  );
}

function formatMoney(amount: number, currency: string | null) {
  return `${(currency ?? "USD").toUpperCase()} ${amount.toFixed(2)}`;
}
