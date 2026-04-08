import {
  HUMAN_LANGUAGE_DICTIONARY,
  type HumanLanguageKey
} from "./human-language.dictionary";
import {
  toActionKey,
  toConfidenceKey,
  toIssueKey,
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

  return {
    primary: getUserFacingText(recommendationKey),
    context: (issueKey ? getUserFacingText(issueKey) : rawReason) ?? undefined,
    why: (issueKey && input.reason ? rawReason : undefined) ?? undefined,
    messageKey: recommendationKey,
    usedFallback
  };
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

export function buildActionLabel(action: string | null | undefined) {
  return getUserFacingText(toActionKey(action));
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
