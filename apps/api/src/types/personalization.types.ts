export type SubscriptionPreferenceBias =
  | "cancel_leaning"
  | "keep_leaning"
  | "review_first"
  | "balanced";

export type PostponementPattern =
  | "none"
  | "commitments_often_postponed"
  | "renewals_often_postponed"
  | "low_importance_postponed"
  | "mixed";

export type QuickWinAffinity = "high" | "medium" | "low";

export type UrgencyResponsiveness = "high" | "medium" | "low";

export type MoneySensitivity = "act_now" | "review_first" | "low";

export type JourneyCompletionStyle =
  | "usually_completes"
  | "often_abandons"
  | "alternative_leaning"
  | "mixed";

export type ReminderReliance = "high" | "medium" | "low";

export type PersonalizationSignals = {
  subscriptionPreferenceBias: SubscriptionPreferenceBias;
  postponementPattern: PostponementPattern;
  quickWinAffinity: QuickWinAffinity;
  urgencyResponsiveness: UrgencyResponsiveness;
  moneySensitivity: MoneySensitivity;
  journeyCompletionStyle: JourneyCompletionStyle;
  reminderReliance: ReminderReliance;
};

export type PersonalizationInfluence = {
  signal: keyof PersonalizationSignals;
  reason: string;
  metrics: Record<string, number | string>;
};

export type PersonalizationSummary = {
  signals: PersonalizationSignals;
  lastUpdatedAt: string | null;
};

export type PersonalizationDebug = PersonalizationSummary & {
  influences: PersonalizationInfluence[];
};
