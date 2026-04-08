export type HumanLanguageKey =
  | "confidence.low"
  | "confidence.medium"
  | "confidence.high"
  | "status.looks_good"
  | "status.needs_review"
  | "status.not_sure_yet"
  | "signals.weak"
  | "signals.conflict"
  | "lifecycle.unknown"
  | "pricing.uncertain"
  | "detected.gmail"
  | "recommendation.review"
  | "recommendation.keep"
  | "recommendation.cancel"
  | "recommendation.downgrade"
  | "recommendation.confirm"
  | "recommendation.ignore"
  | "action.keep"
  | "action.cancel"
  | "action.review"
  | "action.confirm"
  | "action.ignore"
  | "action.remind"
  | "action.details"
  | "action.start"
  | "action.handle_now"
  | "action.postpone"
  | "empty.today"
  | "empty.review"
  | "empty.control_tower"
  | "empty.daily_pulse"
  | "empty.subscription_review"
  | "tone.default_title"
  | "why.default_primary"
  | "why.default_context";

export const HUMAN_LANGUAGE_DICTIONARY: Record<HumanLanguageKey, string> = {
  "confidence.low": "We're not fully sure yet",
  "confidence.medium": "This looks mostly right",
  "confidence.high": "This looks good",
  "status.looks_good": "Looks good",
  "status.needs_review": "Needs review",
  "status.not_sure_yet": "Not sure yet",
  "signals.weak": "We don't have enough information yet",
  "signals.conflict": "Something doesn't match",
  "lifecycle.unknown": "We're still figuring this out",
  "pricing.uncertain": "Price isn't clear yet",
  "detected.gmail": "Found from your emails",
  "recommendation.review": "Take a quick look",
  "recommendation.keep": "Looks good to keep",
  "recommendation.cancel": "You may not need this",
  "recommendation.downgrade": "A lower plan may be enough",
  "recommendation.confirm": "Confirm the details",
  "recommendation.ignore": "No action needed right now",
  "action.keep": "Keep it",
  "action.cancel": "Cancel it",
  "action.review": "Take a closer look",
  "action.confirm": "Confirm details",
  "action.ignore": "Ignore for now",
  "action.remind": "Remind me later",
  "action.details": "See details",
  "action.start": "Start now",
  "action.handle_now": "Handle now",
  "action.postpone": "Postpone",
  "empty.today": "You're all set for now.",
  "empty.review": "Nothing needs review right now.",
  "empty.control_tower": "Nothing is waiting right now.",
  "empty.daily_pulse": "You've handled everything for now.",
  "empty.subscription_review": "No subscription decisions are needed right now.",
  "tone.default_title": "Here's what to do next",
  "why.default_primary": "Take a quick look at this",
  "why.default_context": "Some details aren't fully clear yet"
};
