import type {
  AnchorCategory,
  AnchorConfidence,
  AnchorRecurrenceType,
  AnchorRecurrenceUnit,
  AnchorSource,
  AnchorStatus
} from "@prisma/client";

export interface CreateTrackedAnchorInput {
  label: string;
  normalizedLabel?: string | null;
  category: AnchorCategory;
  recurrenceType?: AnchorRecurrenceType;
  recurrenceInterval?: number | null;
  recurrenceUnit?: AnchorRecurrenceUnit | null;
  expectedAmount?: number | null;
  currencyCode?: string | null;
  nextExpectedDate?: string | Date | null;
  expectedWindowStart?: string | Date | null;
  expectedWindowEnd?: string | Date | null;
  reminderLeadDays?: number | null;
  notes?: string | null;
  source?: AnchorSource;
  confidence?: AnchorConfidence;
  vendorId?: string | null;
  linkedObligationId?: string | null;
}

export interface UpdateTrackedAnchorInput {
  label?: string;
  normalizedLabel?: string | null;
  category?: AnchorCategory;
  recurrenceType?: AnchorRecurrenceType;
  recurrenceInterval?: number | null;
  recurrenceUnit?: AnchorRecurrenceUnit | null;
  expectedAmount?: number | null;
  currencyCode?: string | null;
  nextExpectedDate?: string | Date | null;
  expectedWindowStart?: string | Date | null;
  expectedWindowEnd?: string | Date | null;
  status?: AnchorStatus;
  source?: AnchorSource;
  confidence?: AnchorConfidence;
  reminderLeadDays?: number | null;
  notes?: string | null;
  vendorId?: string | null;
  linkedObligationId?: string | null;
  lastSnoozedUntil?: string | Date | null;
}

export type AnchorRecurrenceDefinition = {
  recurrenceType: AnchorRecurrenceType;
  recurrenceInterval: number | null;
  recurrenceUnit: AnchorRecurrenceUnit | null;
};

export type AnchorExpectedWindow = {
  nextExpectedDate: Date | null;
  expectedWindowStart: Date | null;
  expectedWindowEnd: Date | null;
  confidence: AnchorConfidence;
  reason:
    | "KNOWN_NEXT_EXPECTED_DATE"
    | "RECURRING_FALLBACK"
    | "ONE_TIME_FALLBACK"
    | "INSUFFICIENT_TIMING";
};

export type AnchorDueReason =
  | "IN_WINDOW"
  | "BEFORE_WINDOW"
  | "AFTER_WINDOW"
  | "SNOOZED"
  | "INACTIVE"
  | "INSUFFICIENT_TIMING";

export type AnchorDueUrgency = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type AnchorDueEvaluation = {
  isEligibleForSurfacing: boolean;
  reason: AnchorDueReason;
  urgency: AnchorDueUrgency;
  nextCheckAt: Date | null;
};

export type AnchorLifecycleAction =
  | "CONFIRM"
  | "OBSERVE"
  | "SURFACE"
  | "SNOOZE"
  | "PAUSE"
  | "CANCEL"
  | "ARCHIVE";

export type AdvanceAnchorCycleResult = {
  advanced: boolean;
  nextExpectedDate: Date | null;
  expectedWindowStart: Date | null;
  expectedWindowEnd: Date | null;
  reason:
    | "ADVANCED"
    | "MISSING_NEXT_EXPECTED_DATE"
    | "UNSUPPORTED_RECURRENCE"
    | "NON_RECURRING";
};

export type TrackedAnchorTimingContext = {
  recurrenceType: AnchorRecurrenceType;
  recurrenceInterval: number | null;
  recurrenceUnit: AnchorRecurrenceUnit | null;
  nextExpectedDate: Date | null;
  expectedWindowStart: Date | null;
  expectedWindowEnd: Date | null;
  reminderLeadDays: number | null;
  lastSnoozedUntil: Date | null;
  status: AnchorStatus;
  confidence: AnchorConfidence;
};
