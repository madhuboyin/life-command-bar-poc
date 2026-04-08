import {
  EMOTIONAL_TRUST_DICTIONARY,
  type EmotionalActionType,
  type EmotionalRiskLevel,
  type EmotionalState,
  type EmotionalTrustKey
} from "./emotional-trust.dictionary";
import { buildEmotionalState } from "./emotional-state-builder";
import {
  toConfidenceBand,
  toEmotionalActionType,
  toEmotionalRiskLevel
} from "./emotional-trust.mapper";

type ReassurancePattern =
  | "primary_reassurance"
  | "decision_confidence"
  | "risk_reassurance"
  | "action_aftercare"
  | "reminder_deferral"
  | "household_context"
  | "completion_relief";

export type EmotionalTrustMessage = {
  primary: string;
  supporting?: string;
  why?: string;
  emotionalState: EmotionalState;
  riskLevel?: EmotionalRiskLevel;
  messageKey: EmotionalTrustKey;
  reassurancePattern: ReassurancePattern;
  usedFallback: boolean;
};

type CommonInput = {
  emotionalState?: EmotionalState | null;
  confidenceBand?: "HIGH" | "MEDIUM" | "LOW" | number | null;
  needsReview?: boolean;
  actionType?: string | null;
  riskLevel?: string | null;
  priorityBand?: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | null;
  dueAt?: string | null;
  renewsAt?: string | null;
  canWait?: boolean | null;
  scopeType?: "PERSONAL" | "HOUSEHOLD" | null;
  assigneeName?: string | null;
  remainingCount?: number | null;
};

type ReminderDeferralInput = {
  phase?: "before" | "after";
  remindAt?: string | null;
  repeatedDeferrals?: number;
};

type CompletionReliefInput = {
  remainingCount?: number | null;
  trackCompletion?: boolean;
};

type TelemetryState = {
  emotionalMessageKeys: Record<string, number>;
  reassurancePatterns: Record<string, number>;
  whyThisOpened: number;
  actionAfterReassurance: Record<string, number>;
  deferAfterReassurance: number;
  completionAfterReassurance: number;
  fallbackToRawText: number;
};

const telemetry: TelemetryState = {
  emotionalMessageKeys: {},
  reassurancePatterns: {},
  whyThisOpened: 0,
  actionAfterReassurance: {},
  deferAfterReassurance: 0,
  completionAfterReassurance: 0,
  fallbackToRawText: 0
};

export function getEmotionalTrustText(
  key: EmotionalTrustKey,
  context?: Record<string, string | number | null | undefined>
) {
  const template = EMOTIONAL_TRUST_DICTIONARY[key];
  if (!template) {
    telemetry.fallbackToRawText += 1;
    trackEmotionalMessageKey("fallback.primary");
    publishTelemetry();
    return EMOTIONAL_TRUST_DICTIONARY["fallback.primary"];
  }

  trackEmotionalMessageKey(key);
  if (!context) return template;
  return injectContext(template, context);
}

export function buildPrimaryReassurance(input: CommonInput = {}): EmotionalTrustMessage {
  const emotionalState = buildEmotionalState(input);
  const riskLevel = toEmotionalRiskLevel({
    riskLevel: input.riskLevel,
    priorityBand: input.priorityBand,
    dueAt: input.dueAt,
    renewsAt: input.renewsAt
  });

  const mapping = mapStateToMessage(emotionalState);
  return buildMessage({
    emotionalState,
    riskLevel,
    messageKey: mapping.primary,
    supportingKey: mapping.supporting,
    reassurancePattern: "primary_reassurance",
    context: input.assigneeName ? { name: input.assigneeName } : undefined
  });
}

export function buildDecisionConfidenceMessage(input: {
  confidenceBand?: "HIGH" | "MEDIUM" | "LOW" | number | null;
  actionType?: string | null;
}): EmotionalTrustMessage {
  const confidenceBand = toConfidenceBand(input.confidenceBand);
  const actionType = toEmotionalActionType(input.actionType);
  const supportingKey = mapConfidenceSupportingKey(confidenceBand, actionType);

  return buildMessage({
    emotionalState:
      confidenceBand === "HIGH" ? "CALM_CLEAR" : confidenceBand === "MEDIUM" ? "REVIEW_NEEDED" : "CALM_UNCERTAIN",
    messageKey:
      confidenceBand === "HIGH"
        ? "confidence.high.primary"
        : confidenceBand === "MEDIUM"
          ? "confidence.medium.primary"
          : "confidence.low.primary",
    supportingKey,
    reassurancePattern: "decision_confidence"
  });
}

export function buildRiskReassurance(input: CommonInput = {}): EmotionalTrustMessage {
  const riskLevel = toEmotionalRiskLevel({
    riskLevel: input.riskLevel,
    priorityBand: input.priorityBand,
    dueAt: input.dueAt,
    renewsAt: input.renewsAt
  });

  if (riskLevel === "HIGH") {
    return buildMessage({
      emotionalState: "HIGH_RISK_BUT_CONTROLLABLE",
      riskLevel,
      messageKey: "risk.high.primary",
      supportingKey: "risk.high.supporting",
      reassurancePattern: "risk_reassurance"
    });
  }

  if (riskLevel === "MEDIUM") {
    return buildMessage({
      emotionalState: "MEDIUM_RISK",
      riskLevel,
      messageKey: "risk.medium.primary",
      supportingKey: "risk.medium.supporting",
      reassurancePattern: "risk_reassurance"
    });
  }

  return buildMessage({
    emotionalState: "LOW_RISK",
    riskLevel,
    messageKey: "risk.low.primary",
    supportingKey: "risk.low.supporting",
    reassurancePattern: "risk_reassurance"
  });
}

export function buildActionAftercareMessage(input: {
  actionType?: string | null;
  trackAction?: boolean;
}): EmotionalTrustMessage {
  const actionType = toEmotionalActionType(input.actionType);
  const key = mapActionAftercareKey(actionType);
  if (input.trackAction) {
    trackActionAfterReassurance(actionType, key);
  }
  return buildMessage({
    emotionalState: "ACTION_CONFIRMED",
    messageKey: key,
    supportingKey: "state.action_confirmed.supporting",
    reassurancePattern: "action_aftercare"
  });
}

export function buildReminderDeferralMessage(
  input: ReminderDeferralInput = {}
): EmotionalTrustMessage {
  const phase = input.phase ?? "before";
  if (phase === "after") {
    trackDeferAfterReassurance("reminder.after.primary");
    return buildMessage({
      emotionalState: "SAFE_TO_WAIT",
      messageKey: "reminder.after.primary",
      supportingKey: "reminder.after.supporting",
      reassurancePattern: "reminder_deferral"
    });
  }

  return buildMessage({
    emotionalState: "SAFE_TO_WAIT",
    messageKey: "reminder.before.primary",
    supportingKey: "reminder.before.supporting",
    reassurancePattern: "reminder_deferral"
  });
}

export function buildHouseholdResponsibilityMessage(input: {
  scopeType?: "PERSONAL" | "HOUSEHOLD" | null;
  assigneeName?: string | null;
  dueSoon?: boolean;
}): EmotionalTrustMessage | null {
  if (input.scopeType !== "HOUSEHOLD") return null;

  if (input.assigneeName) {
    return buildMessage({
      emotionalState: "SHARED_RESPONSIBILITY",
      messageKey: "household.assigned",
      supportingKey: "state.shared_responsibility.supporting",
      reassurancePattern: "household_context",
      context: { name: input.assigneeName }
    });
  }

  if (input.dueSoon) {
    return buildMessage({
      emotionalState: "SHARED_RESPONSIBILITY",
      messageKey: "household.unassigned",
      supportingKey: "state.shared_responsibility.supporting",
      reassurancePattern: "household_context"
    });
  }

  return buildMessage({
    emotionalState: "SHARED_RESPONSIBILITY",
    messageKey: "household.shared",
    supportingKey: "state.shared_responsibility.supporting",
    reassurancePattern: "household_context"
  });
}

export function buildCompletionReliefMessage(
  input: CompletionReliefInput = {}
): EmotionalTrustMessage {
  const remainingCount = input.remainingCount ?? 0;
  const isDone = remainingCount <= 0;
  const message = isDone
    ? buildMessage({
        emotionalState: "DONE_FOR_NOW",
        messageKey: "completion.done",
        supportingKey: "state.done_for_now.supporting",
        reassurancePattern: "completion_relief"
      })
    : buildMessage({
        emotionalState: "ACTION_CONFIRMED",
        messageKey: "completion.progress",
        supportingKey: "state.action_confirmed.supporting",
        reassurancePattern: "completion_relief",
        context: { count: remainingCount }
      });

  if (input.trackCompletion) {
    trackCompletionAfterReassurance(message.messageKey);
  }

  return message;
}

export function trackWhyThisOpened(messageKey?: string | null) {
  telemetry.whyThisOpened += 1;
  if (messageKey) {
    telemetry.actionAfterReassurance[`why:${messageKey}`] =
      (telemetry.actionAfterReassurance[`why:${messageKey}`] ?? 0) + 1;
  }
  publishTelemetry();
}

export function trackActionAfterReassurance(
  actionType: EmotionalActionType | string,
  messageKey?: string | null
) {
  const key = `${String(actionType).toLowerCase()}${messageKey ? `:${messageKey}` : ""}`;
  telemetry.actionAfterReassurance[key] = (telemetry.actionAfterReassurance[key] ?? 0) + 1;
  publishTelemetry();
}

export function trackDeferAfterReassurance(messageKey?: string | null) {
  telemetry.deferAfterReassurance += 1;
  if (messageKey) {
    telemetry.actionAfterReassurance[`defer:${messageKey}`] =
      (telemetry.actionAfterReassurance[`defer:${messageKey}`] ?? 0) + 1;
  }
  publishTelemetry();
}

export function trackCompletionAfterReassurance(messageKey?: string | null) {
  telemetry.completionAfterReassurance += 1;
  if (messageKey) {
    telemetry.actionAfterReassurance[`complete:${messageKey}`] =
      (telemetry.actionAfterReassurance[`complete:${messageKey}`] ?? 0) + 1;
  }
  publishTelemetry();
}

export function getEmotionalTrustTelemetry() {
  return {
    emotional_message_key_used: { ...telemetry.emotionalMessageKeys },
    reassurance_pattern_shown: { ...telemetry.reassurancePatterns },
    why_this_opened: telemetry.whyThisOpened,
    action_after_reassurance: { ...telemetry.actionAfterReassurance },
    defer_after_reassurance: telemetry.deferAfterReassurance,
    completion_after_reassurance: telemetry.completionAfterReassurance,
    fallback_to_raw_text: telemetry.fallbackToRawText
  };
}

function buildMessage(input: {
  emotionalState: EmotionalState;
  riskLevel?: EmotionalRiskLevel;
  messageKey: EmotionalTrustKey;
  supportingKey?: EmotionalTrustKey;
  reassurancePattern: ReassurancePattern;
  context?: Record<string, string | number | null | undefined>;
}): EmotionalTrustMessage {
  trackReassurancePattern(input.reassurancePattern);
  return {
    primary: getEmotionalTrustText(input.messageKey, input.context),
    supporting: input.supportingKey
      ? getEmotionalTrustText(input.supportingKey, input.context)
      : undefined,
    emotionalState: input.emotionalState,
    riskLevel: input.riskLevel,
    messageKey: input.messageKey,
    reassurancePattern: input.reassurancePattern,
    usedFallback: input.messageKey === "fallback.primary"
  };
}

function mapStateToMessage(state: EmotionalState): {
  primary: EmotionalTrustKey;
  supporting: EmotionalTrustKey;
} {
  switch (state) {
    case "CALM_CLEAR":
      return { primary: "state.calm_clear.primary", supporting: "state.calm_clear.supporting" };
    case "CALM_UNCERTAIN":
      return {
        primary: "state.calm_uncertain.primary",
        supporting: "state.calm_uncertain.supporting"
      };
    case "REVIEW_NEEDED":
      return { primary: "state.review_needed.primary", supporting: "state.review_needed.supporting" };
    case "DECISION_NOW":
      return { primary: "state.decision_now.primary", supporting: "state.decision_now.supporting" };
    case "SAFE_TO_WAIT":
      return { primary: "state.safe_to_wait.primary", supporting: "state.safe_to_wait.supporting" };
    case "ACTION_CONFIRMED":
      return {
        primary: "state.action_confirmed.primary",
        supporting: "state.action_confirmed.supporting"
      };
    case "DONE_FOR_NOW":
      return { primary: "state.done_for_now.primary", supporting: "state.done_for_now.supporting" };
    case "SHARED_RESPONSIBILITY":
      return {
        primary: "state.shared_responsibility.primary",
        supporting: "state.shared_responsibility.supporting"
      };
    case "LOW_RISK":
      return { primary: "risk.low.primary", supporting: "risk.low.supporting" };
    case "MEDIUM_RISK":
      return { primary: "risk.medium.primary", supporting: "risk.medium.supporting" };
    case "HIGH_RISK_BUT_CONTROLLABLE":
      return { primary: "risk.high.primary", supporting: "risk.high.supporting" };
    default:
      return { primary: "fallback.primary", supporting: "state.calm_clear.supporting" };
  }
}

function mapConfidenceSupportingKey(
  confidenceBand: "HIGH" | "MEDIUM" | "LOW",
  actionType: EmotionalActionType
): EmotionalTrustKey {
  if (confidenceBand === "LOW" && actionType === "REVIEW") {
    return "action.before.review";
  }
  if (confidenceBand === "HIGH" && actionType === "KEEP") {
    return "action.before.keep";
  }
  if (confidenceBand === "MEDIUM" && actionType === "CANCEL") {
    return "action.before.cancel";
  }
  if (confidenceBand !== "HIGH" && actionType === "REMIND_LATER") {
    return "action.before.remind";
  }
  if (confidenceBand === "HIGH") return "confidence.high.supporting";
  if (confidenceBand === "MEDIUM") return "confidence.medium.supporting";
  return "confidence.low.supporting";
}

function mapActionAftercareKey(actionType: EmotionalActionType): EmotionalTrustKey {
  if (actionType === "KEEP") return "action.after.keep";
  if (actionType === "CANCEL") return "action.after.cancel";
  if (actionType === "REMIND_LATER") return "action.after.remind";
  if (actionType === "REVIEW") return "action.after.review";
  if (actionType === "IGNORE") return "action.after.ignore";
  return "action.after.confirm";
}

function injectContext(
  template: string,
  context: Record<string, string | number | null | undefined>
) {
  let output = template;
  for (const [key, value] of Object.entries(context)) {
    output = output.replaceAll(`{${key}}`, value === null || value === undefined ? "" : String(value));
  }
  return output;
}

function trackEmotionalMessageKey(key: EmotionalTrustKey) {
  telemetry.emotionalMessageKeys[key] = (telemetry.emotionalMessageKeys[key] ?? 0) + 1;
  publishTelemetry();
}

function trackReassurancePattern(pattern: ReassurancePattern) {
  telemetry.reassurancePatterns[pattern] = (telemetry.reassurancePatterns[pattern] ?? 0) + 1;
  publishTelemetry();
}

function publishTelemetry() {
  if (typeof window === "undefined") return;
  (
    window as Window & {
      __LCB_EMOTIONAL_TRUST__?: ReturnType<typeof getEmotionalTrustTelemetry>;
    }
  ).__LCB_EMOTIONAL_TRUST__ = getEmotionalTrustTelemetry();
}
