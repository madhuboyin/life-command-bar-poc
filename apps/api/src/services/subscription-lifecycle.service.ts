import {
  SubscriptionAutoRenewStatus,
  SubscriptionLifecycleEventType,
  SubscriptionLifecycleState
} from "@prisma/client";
import type {
  GmailSubscriptionExtractionResult
} from "./gmail-subscription-extractor";
import type { GmailSubscriptionLifecycleEmailType } from "./gmail-subscription-classifier";

export type SubscriptionLifecycleSignal = {
  lifecycleEmailType: GmailSubscriptionLifecycleEmailType;
  extraction: GmailSubscriptionExtractionResult;
};

export type SubscriptionLifecycleTransitionResult = {
  previousState: SubscriptionLifecycleState | null;
  nextState: SubscriptionLifecycleState;
  eventTypes: SubscriptionLifecycleEventType[];
  rationale: string[];
};

export class SubscriptionLifecycleService {
  determineTransition(input: {
    currentState: SubscriptionLifecycleState | null;
    signal: SubscriptionLifecycleSignal;
    priceChanged: boolean;
    now?: Date;
  }): SubscriptionLifecycleTransitionResult {
    const now = input.now ?? new Date();
    const previousState = input.currentState;
    let nextState = input.currentState ?? SubscriptionLifecycleState.UNKNOWN;
    const eventTypes: SubscriptionLifecycleEventType[] = [];
    const rationale: string[] = [];

    if (input.signal.lifecycleEmailType === "WELCOME") {
      const trialEnd = parseIsoDate(input.signal.extraction.trialEndDate);
      const trialIsActive =
        input.signal.extraction.trialStatus === "ACTIVE" ||
        (trialEnd !== null && trialEnd.getTime() >= now.getTime());

      if (trialIsActive) {
        nextState = SubscriptionLifecycleState.TRIALING;
        eventTypes.push(SubscriptionLifecycleEventType.TRIAL_STARTED);
        rationale.push("welcome_trial_signal");
      } else {
        nextState = SubscriptionLifecycleState.DISCOVERED;
        eventTypes.push(SubscriptionLifecycleEventType.DISCOVERED);
        rationale.push("welcome_discovery_signal");
      }
    } else if (input.signal.lifecycleEmailType === "RENEWAL") {
      nextState = SubscriptionLifecycleState.RENEWING;
      eventTypes.push(SubscriptionLifecycleEventType.RENEWAL_DETECTED);
      rationale.push("renewal_signal");
    } else if (input.signal.lifecycleEmailType === "RECEIPT") {
      if (
        previousState === SubscriptionLifecycleState.CANCELED ||
        previousState === SubscriptionLifecycleState.CANCELING ||
        previousState === SubscriptionLifecycleState.ENDED ||
        previousState === SubscriptionLifecycleState.INACTIVE
      ) {
        eventTypes.push(SubscriptionLifecycleEventType.REACTIVATED);
        rationale.push("receipt_after_inactive");
      } else {
        eventTypes.push(SubscriptionLifecycleEventType.RECEIPT_CAPTURED);
        rationale.push("receipt_signal");
      }

      nextState = SubscriptionLifecycleState.ACTIVE;
      if (
        previousState === SubscriptionLifecycleState.DISCOVERED ||
        previousState === SubscriptionLifecycleState.TRIALING ||
        previousState === SubscriptionLifecycleState.UNKNOWN ||
        previousState === null
      ) {
        eventTypes.push(SubscriptionLifecycleEventType.ACTIVATED);
      }
    } else if (input.signal.lifecycleEmailType === "CANCELLATION") {
      const effective = parseIsoDate(input.signal.extraction.cancellationEffectiveDate);
      const cancellationInFuture =
        Boolean(effective) && effective!.getTime() > now.getTime();
      const autoRenewOff =
        input.signal.extraction.autoRenewStatus === SubscriptionAutoRenewStatus.OFF;

      if (autoRenewOff) {
        eventTypes.push(SubscriptionLifecycleEventType.AUTO_RENEW_OFF);
      }

      if (cancellationInFuture) {
        nextState = SubscriptionLifecycleState.CANCELING;
        eventTypes.push(SubscriptionLifecycleEventType.CANCELLATION_DETECTED);
        rationale.push("cancellation_future_effective_date");
      } else {
        nextState = SubscriptionLifecycleState.CANCELED;
        eventTypes.push(SubscriptionLifecycleEventType.CANCELED);
        rationale.push("cancellation_effective_or_immediate");
      }
    }

    if (input.priceChanged && input.signal.lifecycleEmailType !== "CANCELLATION") {
      nextState = SubscriptionLifecycleState.PRICE_CHANGED;
      eventTypes.push(SubscriptionLifecycleEventType.PRICE_CHANGED);
      rationale.push("price_changed");
    }

    if (eventTypes.length === 0) {
      eventTypes.push(SubscriptionLifecycleEventType.CORRECTED);
      rationale.push("state_corrected_without_class_event");
    }

    return {
      previousState,
      nextState,
      eventTypes: Array.from(new Set(eventTypes)),
      rationale
    };
  }
}

function parseIsoDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
