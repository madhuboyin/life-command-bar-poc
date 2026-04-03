export interface ObligationListQuery {
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface CreateObligationInput {
  userId: string;
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
  status?: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED";
}

export interface UpdateObligationInput {
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
  status?: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED";
}
