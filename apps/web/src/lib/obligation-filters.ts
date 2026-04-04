import type { ObligationSort, ObligationView, SortDirection } from "./types";

type FilterMeta = {
  key: ObligationView;
  label: string;
  description: string;
  emptyDescription: string;
  defaultSort: ObligationSort;
  defaultDirection: SortDirection;
};

export const obligationViewMeta: Record<ObligationView, FilterMeta> = {
  urgent: {
    key: "urgent",
    label: "Urgent",
    description: "Items that likely need attention soon.",
    emptyDescription: "No obligations are urgent right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  quick_wins: {
    key: "quick_wins",
    label: "Quick Wins",
    description: "Low-effort items worth clearing now.",
    emptyDescription: "No clear quick wins at the moment.",
    defaultSort: "importance",
    defaultDirection: "desc"
  },
  money: {
    key: "money",
    label: "Money Exposure",
    description: "Open items with known money exposure.",
    emptyDescription: "No open obligations with amount data right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  renewals: {
    key: "renewals",
    label: "Renewals",
    description: "Open renewal obligations.",
    emptyDescription: "No open renewal obligations right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  subscriptions: {
    key: "subscriptions",
    label: "Subscriptions",
    description: "Open subscription obligations.",
    emptyDescription: "No open subscription obligations right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  bills: {
    key: "bills",
    label: "Bills",
    description: "Open bill obligations.",
    emptyDescription: "No open bill obligations right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  postponed_recently: {
    key: "postponed_recently",
    label: "Postponed Recently",
    description: "Items you pushed out recently and may want to revisit.",
    emptyDescription: "No recently postponed obligations were found.",
    defaultSort: "created_at",
    defaultDirection: "desc"
  },
  resolved_recently: {
    key: "resolved_recently",
    label: "Resolved Recently",
    description: "Items you recently cleared.",
    emptyDescription: "No recently resolved obligations were found.",
    defaultSort: "created_at",
    defaultDirection: "desc"
  },
  active_now: {
    key: "active_now",
    label: "Active Now",
    description: "Current active and postponed obligations.",
    emptyDescription: "No active or postponed obligations right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  commitments: {
    key: "commitments",
    label: "Commitments",
    description: "Open commitment obligations.",
    emptyDescription: "No open commitments right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  assigned_to_me: {
    key: "assigned_to_me",
    label: "Assigned To Me",
    description: "Household items explicitly assigned to you.",
    emptyDescription: "No household items are assigned to you right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  unassigned: {
    key: "unassigned",
    label: "Unassigned Shared",
    description: "Household items that anyone can claim.",
    emptyDescription: "No unassigned household items right now.",
    defaultSort: "urgency",
    defaultDirection: "desc"
  },
  household: {
    key: "household",
    label: "Household",
    description: "All shared household obligations.",
    emptyDescription: "No household obligations right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  },
  personal: {
    key: "personal",
    label: "Personal",
    description: "Your personal obligations only.",
    emptyDescription: "No personal obligations right now.",
    defaultSort: "due_date",
    defaultDirection: "asc"
  }
};

const supportedViews = Object.keys(obligationViewMeta) as ObligationView[];
const supportedSorts: ObligationSort[] = [
  "due_date",
  "importance",
  "urgency",
  "created_at",
  "amount"
];
const supportedDirections: SortDirection[] = ["asc", "desc"];

export function parseObligationView(value: string | null | undefined): ObligationView | null {
  if (!value) return null;
  return supportedViews.includes(value as ObligationView) ? (value as ObligationView) : null;
}

export function parseObligationSort(value: string | null | undefined): ObligationSort | null {
  if (!value) return null;
  return supportedSorts.includes(value as ObligationSort) ? (value as ObligationSort) : null;
}

export function parseSortDirection(value: string | null | undefined): SortDirection | null {
  if (!value) return null;
  return supportedDirections.includes(value as SortDirection) ? (value as SortDirection) : null;
}

export function getViewSortSummary(
  view: ObligationView | null,
  sort: ObligationSort | null,
  direction: SortDirection | null
) {
  const fallbackSort = view ? obligationViewMeta[view].defaultSort : "due_date";
  const fallbackDirection = view ? obligationViewMeta[view].defaultDirection : "asc";
  const resolvedSort = sort ?? fallbackSort;
  const resolvedDirection = direction ?? fallbackDirection;

  return describeSort(resolvedSort, resolvedDirection);
}

export function getObligationViewHref(
  view: ObligationView,
  options?: {
    flowSource?:
      | "DAILY_PULSE"
      | "TODAY_FEED"
      | "DASHBOARD"
      | "OBLIGATION_DETAIL"
      | "AUTO_FLOW"
      | "FOCUS_MODE";
  }
) {
  const query = new URLSearchParams();
  query.set("view", view);
  if (options?.flowSource) {
    query.set("flowSource", options.flowSource);
  }
  return `/obligations?${query.toString()}`;
}

function describeSort(sort: ObligationSort, direction: SortDirection) {
  if (sort === "due_date") {
    return direction === "asc" ? "Sorted by due date (soonest first)." : "Sorted by due date (latest first).";
  }

  if (sort === "importance") {
    return direction === "asc"
      ? "Sorted by importance (lowest first)."
      : "Sorted by importance (highest first).";
  }

  if (sort === "urgency") {
    return direction === "asc"
      ? "Sorted by urgency (lowest first)."
      : "Sorted by urgency (highest first).";
  }

  if (sort === "amount") {
    return direction === "asc"
      ? "Sorted by amount (lowest first)."
      : "Sorted by amount (highest first).";
  }

  return direction === "asc"
    ? "Sorted by created date (oldest first)."
    : "Sorted by created date (newest first).";
}
