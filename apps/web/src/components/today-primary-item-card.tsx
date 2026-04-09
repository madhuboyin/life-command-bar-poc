"use client";

import type { DailyCommandCenterItem, TodayActionKey } from "../lib/types";
import { cardStyles, colors } from "../lib/ui";
import TodayActionBar from "./today-action-bar";
import WhyThisToggle from "./why-this-toggle";

export default function TodayPrimaryItemCard({
  item,
  loading,
  onAction
}: {
  item: DailyCommandCenterItem;
  loading: TodayActionKey | null;
  onAction: (itemId: string, actionKey: TodayActionKey) => Promise<void>;
}) {
  const contextLine = buildContextLine(item);
  const decisionLine = buildDecisionLine(item);
  const supportLine = buildSupportLine(item);

  return (
    <article style={{ ...cardStyles.section, display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, color: colors.textMuted }}>{contextLine}</div>
        <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.2 }}>{decisionLine}</h2>
        {supportLine ? (
          <p style={{ margin: 0, color: colors.textMuted, fontSize: 14 }}>{supportLine}</p>
        ) : null}
      </div>

      <TodayActionBar
        item={item}
        loading={loading}
        onAction={(actionKey) => onAction(item.id, actionKey)}
      />

      <WhyThisToggle metricKey="today_resolution_loop_why">
        {compactSentence(item.whyThisMatters) ?? compactSentence(item.whyNow) ?? "This is worth handling now."}
      </WhyThisToggle>
    </article>
  );
}

function buildContextLine(item: DailyCommandCenterItem) {
  if (item.itemType === "TRACKED_ANCHOR") {
    return compactSentence(item.sourceSummary) ?? item.title;
  }

  if (item.renewalDate) {
    return `${item.title} renews ${relativeDateLabel(item.renewalDate)}.`;
  }

  if (item.dueDate) {
    return `${item.title} is due ${relativeDateLabel(item.dueDate)}.`;
  }

  return item.title;
}

function buildDecisionLine(item: DailyCommandCenterItem) {
  if (item.itemType === "TRACKED_ANCHOR") {
    return compactSentence(item.whyNow) ?? "Worth a quick check?";
  }

  if (item.presentationStyle === "SUPPORTED_REVIEW") {
    return "Want a quick look before deciding?";
  }

  if (item.presentationStyle === "COMPACT_ACTION") {
    return "Handle this now?";
  }

  switch (item.primaryAction.key) {
    case "REVIEW":
    case "REVIEW_SUBSCRIPTION":
      return "Worth a quick look before deciding?";
    case "OPEN_GUIDED":
      return "Want to get this done now?";
    case "MARK_DONE":
      return "Handle this now?";
    case "VIEW_DETAILS":
      return "Take a quick look?";
    default:
      return "Handle this now?";
  }
}

function buildSupportLine(item: DailyCommandCenterItem) {
  if (item.itemType === "TRACKED_ANCHOR") {
    const amount = item.amount !== null ? formatMoney(item.amount, item.currency) : null;
    const timing = buildDueOrRenewLine(item) ?? compactSentence(item.subtitle);
    if (amount && timing) {
      return `${amount} · ${timing}`;
    }
    return amount ?? timing ?? compactSentence(item.whyThisMatters);
  }

  const dueOrRenewLine = buildDueOrRenewLine(item);

  if (item.amount !== null) {
    const amount = formatMoney(item.amount, item.currency);
    if (dueOrRenewLine) {
      return `${amount} · ${dueOrRenewLine}`;
    }
    return amount;
  }

  if (dueOrRenewLine) {
    return dueOrRenewLine;
  }

  return compactSentence(item.subtitle) ?? compactSentence(item.whyNow);
}

function buildDueOrRenewLine(item: DailyCommandCenterItem) {
  if (item.dueDate) {
    return `Due ${relativeDateLabel(item.dueDate)}`;
  }
  if (item.renewalDate) {
    return `Renews ${relativeDateLabel(item.renewalDate)}`;
  }
  return null;
}

function relativeDateLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "soon";

  const today = startOfDay(new Date());
  const target = startOfDay(parsed);
  const dayDelta = Math.floor((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDelta <= 0) return "today";
  if (dayDelta === 1) return "tomorrow";
  return `in ${dayDelta} days`;
}

function formatMoney(amount: number, currency: string | null) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency ?? "USD").toUpperCase(),
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${(currency ?? "USD").toUpperCase()} ${amount.toFixed(2)}`;
  }
}

function compactSentence(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
