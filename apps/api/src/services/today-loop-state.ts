export type TodayViewState = "CLEAR" | "ONE_ITEM" | "FEW_ITEMS" | "REVIEW_NEEDED";

export type TodayLoopItem = {
  id: string;
  title: string;
  subtitle: string | null;
  dueDate: string | null;
  renewalDate: string | null;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
  primaryAction: {
    key: string;
    href?: string;
  };
};

export type TodayNextUp = {
  title: string;
  whenLabel: string | null;
  href: string;
};

export type TodayLoopModel<TItem extends TodayLoopItem> = {
  todayState: TodayViewState;
  headline: string;
  subheadline: string;
  primaryItem: TItem | null;
  queuedItems: TItem[];
  totalActionableCount: number;
  nextUp: TodayNextUp | null;
  viewUpcomingAvailable: boolean;
};

const MAX_FOCUS_ITEMS = 3;

const REVIEW_PRIMARY_ACTIONS = new Set(["REVIEW", "REVIEW_SUBSCRIPTION"]);

export function buildTodayLoopModel<TItem extends TodayLoopItem>(input: {
  actionableItems: TItem[];
  upcomingItems: TItem[];
  now?: Date;
}): TodayLoopModel<TItem> {
  const now = input.now ?? new Date();
  const actionable = input.actionableItems.slice(0, MAX_FOCUS_ITEMS);
  const primaryItem = actionable[0] ?? null;
  const queuedItems = actionable.slice(1);
  const nextUp = buildNextUp(input.upcomingItems[0] ?? null, now);

  if (!primaryItem) {
    return {
      todayState: "CLEAR",
      headline: "You're all set for now",
      subheadline: "Nothing needs your attention today.",
      primaryItem: null,
      queuedItems: [],
      totalActionableCount: 0,
      nextUp,
      viewUpcomingAvailable: input.upcomingItems.length > 0
    };
  }

  if (isReviewNeeded(primaryItem) && actionable.every((item) => isReviewNeeded(item))) {
    return {
      todayState: "REVIEW_NEEDED",
      headline: "Something may need a quick look",
      subheadline: "We're not fully sure yet.",
      primaryItem,
      queuedItems,
      totalActionableCount: actionable.length,
      nextUp,
      viewUpcomingAvailable: input.upcomingItems.length > 0
    };
  }

  if (actionable.length === 1) {
    return {
      todayState: "ONE_ITEM",
      headline: "1 thing needs attention",
      subheadline: "Takes about 30 seconds.",
      primaryItem,
      queuedItems,
      totalActionableCount: 1,
      nextUp,
      viewUpcomingAvailable: input.upcomingItems.length > 0
    };
  }

  return {
    todayState: "FEW_ITEMS",
    headline: "A few things to take care of",
    subheadline: "Start with this.",
    primaryItem,
    queuedItems,
    totalActionableCount: actionable.length,
    nextUp,
    viewUpcomingAvailable: input.upcomingItems.length > 0
  };
}

function buildNextUp(item: TodayLoopItem | null, now: Date): TodayNextUp | null {
  if (!item) return null;

  const href = item.primaryAction.href ?? "/upcoming";
  const whenLabel = buildWhenLabel(item, now);

  return {
    title: item.title,
    whenLabel,
    href
  };
}

function buildWhenLabel(item: TodayLoopItem, now: Date): string | null {
  const dateValue = item.dueDate ?? item.renewalDate;
  if (!dateValue) return item.subtitle;

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return item.subtitle;

  const daysAway = Math.floor((startOfDayUTC(parsed).getTime() - startOfDayUTC(now).getTime()) / (24 * 60 * 60 * 1000));
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway} days`;
}

function isReviewNeeded(item: TodayLoopItem) {
  return item.confidenceBand === "LOW" || REVIEW_PRIMARY_ACTIONS.has(item.primaryAction.key);
}

function startOfDayUTC(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
