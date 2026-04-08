export type EmotionalState =
  | "CALM_CLEAR"
  | "CALM_UNCERTAIN"
  | "REVIEW_NEEDED"
  | "DECISION_NOW"
  | "SAFE_TO_WAIT"
  | "ACTION_CONFIRMED"
  | "DONE_FOR_NOW"
  | "SHARED_RESPONSIBILITY"
  | "LOW_RISK"
  | "MEDIUM_RISK"
  | "HIGH_RISK_BUT_CONTROLLABLE";

export type EmotionalRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type EmotionalActionType =
  | "KEEP"
  | "CANCEL"
  | "REMIND_LATER"
  | "REVIEW"
  | "CONFIRM"
  | "IGNORE"
  | "START"
  | "DETAILS"
  | "OTHER";

export type EmotionalTrustKey =
  | "state.calm_clear.primary"
  | "state.calm_clear.supporting"
  | "state.calm_uncertain.primary"
  | "state.calm_uncertain.supporting"
  | "state.review_needed.primary"
  | "state.review_needed.supporting"
  | "state.decision_now.primary"
  | "state.decision_now.supporting"
  | "state.safe_to_wait.primary"
  | "state.safe_to_wait.supporting"
  | "state.action_confirmed.primary"
  | "state.action_confirmed.supporting"
  | "state.done_for_now.primary"
  | "state.done_for_now.supporting"
  | "state.shared_responsibility.primary"
  | "state.shared_responsibility.supporting"
  | "risk.low.primary"
  | "risk.low.supporting"
  | "risk.medium.primary"
  | "risk.medium.supporting"
  | "risk.high.primary"
  | "risk.high.supporting"
  | "confidence.low.primary"
  | "confidence.low.supporting"
  | "confidence.medium.primary"
  | "confidence.medium.supporting"
  | "confidence.high.primary"
  | "confidence.high.supporting"
  | "action.before.keep"
  | "action.before.cancel"
  | "action.before.remind"
  | "action.before.review"
  | "action.after.keep"
  | "action.after.cancel"
  | "action.after.remind"
  | "action.after.review"
  | "action.after.confirm"
  | "action.after.ignore"
  | "reminder.before.primary"
  | "reminder.before.supporting"
  | "reminder.after.primary"
  | "reminder.after.supporting"
  | "household.unassigned"
  | "household.assigned"
  | "household.shared"
  | "completion.done"
  | "completion.progress"
  | "fallback.primary";

export const EMOTIONAL_TRUST_DICTIONARY: Record<EmotionalTrustKey, string> = {
  "state.calm_clear.primary": "You're in good shape right now.",
  "state.calm_clear.supporting": "This looks clear and ready.",
  "state.calm_uncertain.primary": "We're not fully sure yet.",
  "state.calm_uncertain.supporting": "A quick review will make this more reliable.",
  "state.review_needed.primary": "A quick review is the safest next step.",
  "state.review_needed.supporting": "Some details still need a quick check.",
  "state.decision_now.primary": "This is worth deciding before the next charge.",
  "state.decision_now.supporting": "You can decide now, or come back later.",
  "state.safe_to_wait.primary": "Nothing urgent yet.",
  "state.safe_to_wait.supporting": "You can leave this for now.",
  "state.action_confirmed.primary": "That decision is saved.",
  "state.action_confirmed.supporting": "You can move on with confidence.",
  "state.done_for_now.primary": "You're done for now.",
  "state.done_for_now.supporting": "Nothing important needs attention right now.",
  "state.shared_responsibility.primary": "This is shared, so either of you can handle it.",
  "state.shared_responsibility.supporting": "No one is blocked from taking this on.",
  "risk.low.primary": "No urgent risk right now.",
  "risk.low.supporting": "This looks stable for now.",
  "risk.medium.primary": "This renews soon, so it's worth a quick look.",
  "risk.medium.supporting": "There's no emergency, but this is worth reviewing.",
  "risk.high.primary": "This needs attention soon, and it's manageable.",
  "risk.high.supporting": "A quick decision now can prevent surprises.",
  "confidence.low.primary": "We're not fully sure yet.",
  "confidence.low.supporting": "A quick check is the safest next step.",
  "confidence.medium.primary": "This looks mostly right.",
  "confidence.medium.supporting": "A quick review can confirm the details.",
  "confidence.high.primary": "This looks good.",
  "confidence.high.supporting": "This appears ready to act on.",
  "action.before.keep": "If this still looks right, you can keep it.",
  "action.before.cancel": "If you no longer need this, start with cancellation guidance.",
  "action.before.remind": "Not ready? You can come back to this later.",
  "action.before.review": "A quick review will clear this up.",
  "action.after.keep": "Got it — we'll treat this as safe for now.",
  "action.after.cancel": "We'll help you track the cancellation so nothing gets missed.",
  "action.after.remind": "No problem — we'll remind you later.",
  "action.after.review": "Thanks — this will make future suggestions more accurate.",
  "action.after.confirm": "Thanks — details are now confirmed.",
  "action.after.ignore": "Okay — we'll keep this out of your way for now.",
  "reminder.before.primary": "Not ready? You can come back to this later.",
  "reminder.before.supporting": "Pick a date and we'll bring it back at the right time.",
  "reminder.after.primary": "No problem — we'll remind you later.",
  "reminder.after.supporting": "We'll keep track of this for you.",
  "household.unassigned": "This still needs someone's attention.",
  "household.assigned": "This is assigned to {name}, but you can still take a look.",
  "household.shared": "This is shared, so anyone in the household can review it.",
  "completion.done": "That's taken care of.",
  "completion.progress": "Nice progress — {count} left when you're ready.",
  "fallback.primary": "You're in control, and we'll guide you step by step."
};
