import { ObligationStatus } from "../enums/obligation-status";
import { ObligationType } from "../enums/obligation-type";

export type EffortLevel = "low" | "medium" | "high";
export type ImpactLevel = "low" | "medium" | "high";

export interface Obligation {
  id: string;
  type: ObligationType;
  title: string;
  description?: string;
  vendor?: string;
  amount?: number | null;
  dueDate?: string | null;
  source: "manual" | "email" | "document" | "inferred";
  confidenceScore: number;
  urgencyScore: number;
  importanceScore: number;
  effortLevel: EffortLevel;
  impactLevel: ImpactLevel;
  status: ObligationStatus;
  suggestedActions: string[];
  createdAt: string;
  updatedAt: string;
}
