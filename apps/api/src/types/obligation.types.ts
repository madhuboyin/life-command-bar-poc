export type ObligationView =
  | "urgent"
  | "quick_wins"
  | "money"
  | "renewals"
  | "subscriptions"
  | "bills"
  | "postponed_recently"
  | "resolved_recently"
  | "active_now"
  | "commitments"
  | "assigned_to_me"
  | "unassigned"
  | "household"
  | "personal";

export type ObligationSort = "due_date" | "importance" | "urgency" | "created_at" | "amount";
export type SortDirection = "asc" | "desc";

export interface ObligationListQuery {
  status?: string;
  type?: string;
  view?: ObligationView;
  householdId?: string;
  scopeType?: "PERSONAL" | "HOUSEHOLD";
  sort?: ObligationSort;
  direction?: SortDirection;
  limit?: number;
  offset?: number;
}

export interface CreateObligationInput {
  userId: string;
  scopeType?: "PERSONAL" | "HOUSEHOLD";
  householdId?: string | null;
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  lastHandledByUserId?: string | null;
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  title: string;
  description?: string;
  vendor?: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  recurrence?: string;
  source?: "MANUAL" | "EMAIL" | "DOCUMENT" | "INFERRED";
  confidenceScore?: number;
  urgencyScore?: number;
  importanceScore?: number;
  effortLevel?: "LOW" | "MEDIUM" | "HIGH";
  impactLevel?: "LOW" | "MEDIUM" | "HIGH";
  status?: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED" | "DISCOVERED" | "ENDING";
}

export interface UpdateObligationInput {
  scopeType?: "PERSONAL" | "HOUSEHOLD";
  householdId?: string | null;
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  lastHandledByUserId?: string | null;
  type?: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  title?: string;
  description?: string | null;
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  dueDate?: string | null;
  recurrence?: string | null;
  source?: "MANUAL" | "EMAIL" | "DOCUMENT" | "INFERRED";
  confidenceScore?: number;
  urgencyScore?: number;
  importanceScore?: number;
  effortLevel?: "LOW" | "MEDIUM" | "HIGH";
  impactLevel?: "LOW" | "MEDIUM" | "HIGH";
  status?: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED" | "DISCOVERED" | "ENDING";
}
