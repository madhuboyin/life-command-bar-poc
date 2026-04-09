import type {
  AnchorCategory,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorStatus,
  TrackedAnchor
} from "@prisma/client";

export type TrackedAnchorView = {
  id: string;
  label: string;
  category: AnchorCategory;
  categoryLabel: string;
  status: AnchorStatus;
  statusLabel: string;
  recurrenceType: AnchorRecurrenceType;
  recurrenceInterval: number | null;
  recurrenceUnit: AnchorRecurrenceUnit | null;
  cadenceLabel: string;
  nextExpectedDate: string | null;
  expectedWindowStart: string | null;
  expectedWindowEnd: string | null;
  timingSummary: string | null;
  expectedAmount: number | null;
  currencyCode: string | null;
  reminderLeadDays: number | null;
  notes: string | null;
  lastSnoozedUntil: string | null;
  availableActions: Array<
    "EDIT" | "PAUSE" | "CANCEL" | "ARCHIVE" | "SNOOZE"
  >;
  createdAt: string;
  updatedAt: string;
};

export type TrackedAnchorCreateSuccess = {
  title: string;
  description: string;
  reassurance: string;
  nextTimingLine: string | null;
};

export function mapTrackedAnchor(anchor: TrackedAnchor): TrackedAnchorView {
  return {
    id: anchor.id,
    label: anchor.label,
    category: anchor.category,
    categoryLabel: categoryLabel(anchor.category),
    status: anchor.status,
    statusLabel: statusLabel(anchor.status),
    recurrenceType: anchor.recurrenceType,
    recurrenceInterval: anchor.recurrenceInterval,
    recurrenceUnit: anchor.recurrenceUnit,
    cadenceLabel: cadenceLabel(
      anchor.recurrenceType,
      anchor.recurrenceUnit,
      anchor.recurrenceInterval
    ),
    nextExpectedDate: toIso(anchor.nextExpectedDate),
    expectedWindowStart: toIso(anchor.expectedWindowStart),
    expectedWindowEnd: toIso(anchor.expectedWindowEnd),
    timingSummary: buildTimingSummary(anchor),
    expectedAmount:
      anchor.expectedAmount === null ? null : Number(anchor.expectedAmount),
    currencyCode: anchor.currencyCode,
    reminderLeadDays: anchor.reminderLeadDays,
    notes: anchor.notes,
    lastSnoozedUntil: toIso(anchor.lastSnoozedUntil),
    availableActions: buildAvailableActions(anchor.status),
    createdAt: anchor.createdAt.toISOString(),
    updatedAt: anchor.updatedAt.toISOString()
  };
}

export function buildTrackedAnchorCreateSuccess(
  anchor: TrackedAnchor
): TrackedAnchorCreateSuccess {
  const timingLine = buildCreateTimingLine(anchor);
  return {
    title: `Got it - we'll keep an eye on ${anchor.label} for you.`,
    description: timingLine
      ? "We'll remind you before it likely comes up."
      : "We'll keep watching and let you know when it's likely coming up.",
    reassurance: "You don't have to keep this in your head anymore.",
    nextTimingLine: timingLine
  };
}

function buildCreateTimingLine(anchor: TrackedAnchor) {
  if (anchor.nextExpectedDate) {
    return `Likely around ${formatDate(anchor.nextExpectedDate)}.`;
  }

  if (anchor.expectedWindowStart && anchor.expectedWindowEnd) {
    return `Likely between ${formatDate(anchor.expectedWindowStart)} and ${formatDate(
      anchor.expectedWindowEnd
    )}.`;
  }

  return null;
}

function buildTimingSummary(anchor: TrackedAnchor) {
  if (anchor.nextExpectedDate) {
    return `Likely around ${formatDate(anchor.nextExpectedDate)}`;
  }

  if (anchor.expectedWindowStart && anchor.expectedWindowEnd) {
    return `Likely between ${formatDate(anchor.expectedWindowStart)} and ${formatDate(
      anchor.expectedWindowEnd
    )}`;
  }

  if (anchor.recurrenceType === "RECURRING" && anchor.recurrenceUnit) {
    if (anchor.recurrenceUnit === "MONTH") return "Usually monthly";
    if (anchor.recurrenceUnit === "YEAR") return "Usually yearly";
    if (anchor.recurrenceUnit === "WEEK") return "Usually weekly";
    if (anchor.recurrenceUnit === "QUARTER") return "Usually every few months";
  }

  if (anchor.recurrenceType === "ONE_TIME") {
    return "One-time watch";
  }

  return "We'll keep watching and learn the timing";
}

function buildAvailableActions(
  status: AnchorStatus
): Array<"EDIT" | "PAUSE" | "CANCEL" | "ARCHIVE" | "SNOOZE"> {
  if (status === "ACTIVE") {
    return ["EDIT", "PAUSE", "SNOOZE", "CANCEL", "ARCHIVE"];
  }

  if (status === "PAUSED") {
    return ["EDIT", "CANCEL", "ARCHIVE"];
  }

  if (status === "CANCELLED") {
    return ["ARCHIVE"];
  }

  return [];
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(value);
}

function categoryLabel(category: AnchorCategory) {
  if (category === "SUBSCRIPTION") return "Subscription";
  if (category === "BILL") return "Bill";
  if (category === "INSURANCE") return "Insurance";
  if (category === "MEMBERSHIP") return "Membership";
  if (category === "LOAN") return "Loan";
  if (category === "TAX") return "Tax";
  return "Something else";
}

function statusLabel(status: AnchorStatus) {
  if (status === "ACTIVE") return "Watching";
  if (status === "PAUSED") return "Paused";
  if (status === "CANCELLED") return "Canceled";
  return "Archived";
}

function cadenceLabel(
  recurrenceType: AnchorRecurrenceType,
  recurrenceUnit: AnchorRecurrenceUnit | null,
  recurrenceInterval: number | null
) {
  if (recurrenceType === "ONE_TIME") return "One time";
  if (recurrenceType === "UNKNOWN" || !recurrenceUnit) return "Not sure yet";

  if (recurrenceUnit === "WEEK") {
    return recurrenceInterval && recurrenceInterval > 1
      ? `Every ${recurrenceInterval} weeks`
      : "Weekly";
  }
  if (recurrenceUnit === "MONTH") {
    return recurrenceInterval && recurrenceInterval > 1
      ? `Every ${recurrenceInterval} months`
      : "Monthly";
  }
  if (recurrenceUnit === "QUARTER") {
    return recurrenceInterval && recurrenceInterval > 1
      ? `Every ${recurrenceInterval} quarters`
      : "Quarterly";
  }

  return recurrenceInterval && recurrenceInterval > 1
    ? `Every ${recurrenceInterval} years`
    : "Yearly";
}
