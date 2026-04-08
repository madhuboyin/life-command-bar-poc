import {
  HUMAN_LANGUAGE_DICTIONARY,
  type HumanLanguageKey
} from "./human-language.dictionary";
import {
  toActionKey,
  toConfidenceKey,
  toIssueKey,
  normalize as normalizeKey,
  toRecommendationKey,
  toStatusKey
} from "./human-language.mapper";

type BuilderResult = {
  primary: string;
  context?: string;
  why?: string;
  messageKey: HumanLanguageKey;
  usedFallback: boolean;
};

type SummaryMessageInput = {
  confidence?: "HIGH" | "MEDIUM" | "LOW" | number | null;
  issue?: string | null;
  source?: string | null;
};

type RecommendationMessageInput = {
  recommendationType?: string | null;
  issue?: string | null;
  reason?: string | null;
  presentationStyle?: MessagePresentationStyle;
};

type WhyMessageInput = {
  primaryReason?: string | null;
  context?: string | null;
  source?: string | null;
  confidence?: "HIGH" | "MEDIUM" | "LOW" | number | null;
  issue?: string | null;
};

type EmptyStateSurface =
  | "today"
  | "review"
  | "control_tower"
  | "daily_pulse"
  | "subscription_review";

export type MessagePresentationStyle =
  | "DEFAULT"
  | "COMPACT_ACTION"
  | "SUPPORTED_REVIEW";

export type ReminderSuggestionStyle =
  | "DEFAULT"
  | "SHORT_FOLLOWUP"
  | "REALISTIC_FOLLOWUP";

type TelemetryState = {
  messageKeys: Record<string, number>;
  fallbackToRawText: number;
  actionByMessageKey: Record<string, number>;
};

const telemetry: TelemetryState = {
  messageKeys: {},
  fallbackToRawText: 0,
  actionByMessageKey: {}
};

export function getUserFacingText(
  key: HumanLanguageKey,
  context?: Record<string, string | number | null | undefined>
) {
  const template = HUMAN_LANGUAGE_DICTIONARY[key];
  if (!template) {
    telemetry.fallbackToRawText += 1;
    trackMessageKey("tone.default_title");
    return HUMAN_LANGUAGE_DICTIONARY["tone.default_title"];
  }

  trackMessageKey(key);
  if (!context) return template;
  return injectContext(template, context);
}

export function buildSummaryMessage(input: SummaryMessageInput): BuilderResult {
  const issueKey = toIssueKey(input.issue);
  if (issueKey) {
    const context = input.source ? sourceToContext(input.source) : undefined;
    return {
      primary: getUserFacingText(issueKey),
      context: context ?? undefined,
      messageKey: issueKey,
      usedFallback: false
    };
  }

  const confidenceKey = toConfidenceKey(input.confidence);
  const statusKey = toStatusKey(input.confidence);

  return {
    primary: getUserFacingText(statusKey),
    context: getUserFacingText(confidenceKey),
    messageKey: confidenceKey,
    usedFallback: false
  };
}

export function buildRecommendationMessage(
  input: RecommendationMessageInput
): BuilderResult {
  const recommendationKey = toRecommendationKey(input.recommendationType);
  const issueKey = toIssueKey(input.issue);
  const rawReason = toSimpleSentence(input.reason);
  const usedFallback = !issueKey && Boolean(rawReason);
  if (usedFallback) {
    telemetry.fallbackToRawText += 1;
    publishTelemetry();
  }

  const base = {
    primary: getUserFacingText(recommendationKey),
    context: (issueKey ? getUserFacingText(issueKey) : rawReason) ?? undefined,
    why: (issueKey && input.reason ? rawReason : undefined) ?? undefined,
    messageKey: recommendationKey,
    usedFallback
  };

  return tuneRecommendationMessage(base, {
    recommendationType: input.recommendationType,
    presentationStyle: input.presentationStyle ?? "DEFAULT",
    hasIssueKey: Boolean(issueKey)
  });
}

export function buildWhyMessage(input: WhyMessageInput): BuilderResult {
  const issueKey = toIssueKey(input.issue);
  const confidenceKey = toConfidenceKey(input.confidence);
  const primary = toSimpleSentence(input.primaryReason) || getUserFacingText("why.default_primary");
  const context =
    toSimpleSentence(input.context) ||
    (issueKey ? getUserFacingText(issueKey) : getUserFacingText(confidenceKey));
  const why = input.source ? sourceToContext(input.source) : undefined;
  const usedFallback = !input.primaryReason;
  if (usedFallback) {
    telemetry.fallbackToRawText += 1;
    publishTelemetry();
  }

  return {
    primary,
    context: context ?? undefined,
    why: why ?? undefined,
    messageKey: issueKey ?? confidenceKey,
    usedFallback
  };
}

export function buildActionLabel(
  action: string | null | undefined,
  options?: {
    presentationStyle?: MessagePresentationStyle;
    reminderStyle?: ReminderSuggestionStyle;
    isPrimary?: boolean;
  }
) {
  const base = getUserFacingText(toActionKey(action));
  const presentationStyle = options?.presentationStyle ?? "DEFAULT";
  const reminderStyle = options?.reminderStyle ?? "DEFAULT";
  if (presentationStyle === "DEFAULT" && reminderStyle === "DEFAULT") {
    return base;
  }

  const normalized = normalizeKey(action);
  const isReminderAction = normalized.includes("remind") || normalized.includes("postpone");
  if (isReminderAction) {
    if (reminderStyle === "SHORT_FOLLOWUP") return "Remind soon";
    if (reminderStyle === "REALISTIC_FOLLOWUP") return "Set follow-up";
  }

  if (presentationStyle === "COMPACT_ACTION") {
    if (normalized.includes("review")) return "Review";
    if (normalized.includes("handle") || normalized.includes("start") || normalized.includes("done")) {
      return options?.isPrimary ? "Do now" : base;
    }
    return base;
  }

  if (presentationStyle === "SUPPORTED_REVIEW") {
    if (normalized.includes("review")) return "Review first";
    if (isReminderAction && reminderStyle !== "SHORT_FOLLOWUP") return "Follow up later";
  }

  return base;
}

export function buildEmptyStateMessage(surface: EmptyStateSurface): BuilderResult {
  const key =
    surface === "today"
      ? "empty.today"
      : surface === "review"
        ? "empty.review"
        : surface === "control_tower"
          ? "empty.control_tower"
          : surface === "daily_pulse"
            ? "empty.daily_pulse"
            : "empty.subscription_review";

  return {
    primary: getUserFacingText(key),
    context: getUserFacingText("why.default_context"),
    messageKey: key,
    usedFallback: false
  };
}

export function trackMessageAction(messageKey: string | null | undefined) {
  if (!messageKey) return;
  telemetry.actionByMessageKey[messageKey] = (telemetry.actionByMessageKey[messageKey] ?? 0) + 1;
  publishTelemetry();
}

export function getHumanLanguageTelemetry() {
  return {
    message_key_used: { ...telemetry.messageKeys },
    fallback_to_raw_text: telemetry.fallbackToRawText,
    user_action_rate_after_message_display: buildActionRate()
  };
}

function toSimpleSentence(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function sourceToContext(source: string) {
  const normalized = source.toLowerCase();
  if (normalized.includes("gmail") || normalized.includes("email")) {
    return getUserFacingText("detected.gmail");
  }
  return null;
}

function injectContext(
  template: string,
  context: Record<string, string | number | null | undefined>
) {
  let output = template;

  for (const [key, value] of Object.entries(context)) {
    const token = `{${key}}`;
    output = output.replaceAll(token, value === null || value === undefined ? "" : String(value));
  }

  return output;
}

function trackMessageKey(key: HumanLanguageKey) {
  telemetry.messageKeys[key] = (telemetry.messageKeys[key] ?? 0) + 1;
  publishTelemetry();
}

function buildActionRate() {
  const result: Record<string, number> = {};
  for (const [messageKey, shownCount] of Object.entries(telemetry.messageKeys)) {
    if (shownCount <= 0) continue;
    const actedCount = telemetry.actionByMessageKey[messageKey] ?? 0;
    result[messageKey] = Number((actedCount / shownCount).toFixed(4));
  }
  return result;
}

function publishTelemetry() {
  if (typeof window === "undefined") return;
  (window as Window & { __LCB_HUMAN_LANGUAGE__?: ReturnType<typeof getHumanLanguageTelemetry> }).__LCB_HUMAN_LANGUAGE__ =
    getHumanLanguageTelemetry();
}

function tuneRecommendationMessage(
  base: BuilderResult,
  input: {
    recommendationType?: string | null;
    presentationStyle: MessagePresentationStyle;
    hasIssueKey: boolean;
  }
): BuilderResult {
  if (input.presentationStyle === "DEFAULT") {
    return base;
  }

  const normalizedRecommendation = normalizeKey(input.recommendationType);
  if (input.presentationStyle === "COMPACT_ACTION") {
    const compactPrimary = normalizedRecommendation.includes("review")
      ? "Quick review"
      : normalizedRecommendation.includes("mark_done") ||
          normalizedRecommendation.includes("handle") ||
          normalizedRecommendation.includes("confirm")
        ? "Handle now"
        : normalizedRecommendation.includes("open_guided") ||
            normalizedRecommendation.includes("start")
          ? "Start now"
          : base.primary;

    return {
      ...base,
      primary: compactPrimary,
      context: input.hasIssueKey ? compactSentence(base.context) : undefined
    };
  }

  const supportiveTail = "A quick look first is enough.";
  const baseContext = base.context ? compactSentence(base.context) : null;
  const tunedContext = baseContext
    ? `${baseContext} ${supportiveTail}`.trim()
    : supportiveTail;

  return {
    ...base,
    primary: normalizedRecommendation.includes("review")
      ? "Review before deciding"
      : base.primary,
    context: tunedContext
  };
}

function compactSentence(value?: string | null) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
}
