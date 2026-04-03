import type { ObligationView } from "./types";

type FilterMeta = {
  label: string;
  description: string;
};

export const obligationViewMeta: Record<ObligationView, FilterMeta> = {
  urgent: {
    label: "Urgent",
    description: "Items that likely need attention soon."
  },
  quick_wins: {
    label: "Quick Wins",
    description: "Low-effort items worth clearing now."
  },
  money: {
    label: "Money Exposure",
    description: "Open items with known money exposure."
  },
  renewals: {
    label: "Renewals",
    description: "Open renewal obligations."
  },
  subscriptions: {
    label: "Subscriptions",
    description: "Open subscription obligations."
  },
  bills: {
    label: "Bills",
    description: "Open bill obligations."
  },
  postponed_recently: {
    label: "Postponed Recently",
    description: "Items you pushed out recently and may want to revisit."
  },
  resolved_recently: {
    label: "Resolved Recently",
    description: "Items you recently cleared."
  },
  active_now: {
    label: "Active Now",
    description: "Current active and postponed obligations."
  },
  commitments: {
    label: "Commitments",
    description: "Open commitment obligations."
  }
};

const supportedViews = Object.keys(obligationViewMeta) as ObligationView[];

export function parseObligationView(value: string | null | undefined): ObligationView | null {
  if (!value) return null;
  return supportedViews.includes(value as ObligationView) ? (value as ObligationView) : null;
}

export function getObligationViewHref(view: ObligationView) {
  return `/obligations?view=${encodeURIComponent(view)}`;
}
