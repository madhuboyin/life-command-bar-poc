import {
  SubscriptionInsightSeverity,
  SubscriptionInsightType,
  SubscriptionRecommendationType
} from "@prisma/client";

export type SubscriptionInsightRecord = {
  id: string;
  subscriptionId: string;
  insightType: SubscriptionInsightType;
  title: string;
  description: string;
  severity: SubscriptionInsightSeverity;
  confidence: number;
  metadata: Record<string, unknown> | null;
  recommendedAction: string;
  createdAt: string;
  updatedAt?: string;
};

export type SubscriptionRecommendationRecord = {
  subscriptionId: string;
  recommendationType: SubscriptionRecommendationType;
  reason: string;
  confidence: number;
  supportingInsights: SubscriptionInsightType[];
  createdAt?: string;
  updatedAt?: string;
};

export type SubscriptionHealthBand = "GOOD" | "FAIR" | "AT_RISK";

export type SubscriptionHealth = {
  score: number;
  band: SubscriptionHealthBand;
  rationale: string[];
};

export type SubscriptionOptimizationRecord = {
  subscriptionId: string;
  health: SubscriptionHealth;
  insights: SubscriptionInsightRecord[];
  recommendation: SubscriptionRecommendationRecord;
};

export type SubscriptionInsightCandidate = Omit<
  SubscriptionInsightRecord,
  "id" | "createdAt" | "updatedAt"
>;

