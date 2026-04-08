import {
  BehaviorActionSpeed,
  BehaviorDeferFrequency,
  BehaviorReviewPreference,
  type UserBehaviorProfile
} from "@prisma/client";

export type TodayPresentationStyle =
  | "DEFAULT"
  | "COMPACT_ACTION"
  | "SUPPORTED_REVIEW";

export type ReminderSuggestionStyle =
  | "DEFAULT"
  | "SHORT_FOLLOWUP"
  | "REALISTIC_FOLLOWUP";

export type PersonalizationAdjustmentSource =
  | "actionSpeed"
  | "reviewPreference"
  | "deferFrequency";

export type PersonalizationAdjustment = {
  source: PersonalizationAdjustmentSource;
  effect: string;
  delta: number;
};

export type PersonalizationDebugMetadata = {
  basePriorityScore: number;
  finalPriorityScore: number;
  personalizationApplied: boolean;
  presentationStyle: TodayPresentationStyle;
  reminderStyle: ReminderSuggestionStyle;
  adjustments: PersonalizationAdjustment[];
};

export type BehaviorProfileView = {
  actionSpeed: BehaviorActionSpeed;
  reviewPreference: BehaviorReviewPreference;
  deferFrequency: BehaviorDeferFrequency;
};

export type ReminderScheduleDecision = {
  remindAt: Date;
  reminderStyle: ReminderSuggestionStyle;
  usedPersonalizedDefault: boolean;
  reason: "USER_PROVIDED" | "PROFILE_TUNED_DEFAULT" | "BASELINE_DEFAULT";
};

export const UNKNOWN_BEHAVIOR_PROFILE: BehaviorProfileView = {
  actionSpeed: BehaviorActionSpeed.UNKNOWN,
  reviewPreference: BehaviorReviewPreference.UNKNOWN,
  deferFrequency: BehaviorDeferFrequency.UNKNOWN
};

export function toBehaviorProfileView(
  profile: Pick<
    UserBehaviorProfile,
    "actionSpeed" | "reviewPreference" | "deferFrequency"
  > | null | undefined
): BehaviorProfileView {
  if (!profile) {
    return UNKNOWN_BEHAVIOR_PROFILE;
  }

  return {
    actionSpeed: profile.actionSpeed,
    reviewPreference: profile.reviewPreference,
    deferFrequency: profile.deferFrequency
  };
}
