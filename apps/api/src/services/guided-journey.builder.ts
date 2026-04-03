import { ObligationType } from "@prisma/client";
import { mapObligation } from "../utils/obligation.mapper";
import type {
  GuidedJourneyTemplate,
  GuidedJourneyTemplateStep
} from "../types/guided-journey.types";

type ObligationForJourney = ReturnType<typeof mapObligation>;

export function buildGuidedJourneyTemplate(
  obligation: ObligationForJourney
): GuidedJourneyTemplate {
  switch (obligation.type) {
    case ObligationType.SUBSCRIPTION:
      return buildSubscriptionJourney(obligation);
    case ObligationType.RENEWAL:
      return buildRenewalJourney(obligation);
    case ObligationType.COMMITMENT:
      return buildCommitmentJourney(obligation);
    case ObligationType.BILL:
    default:
      return buildBillJourney(obligation);
  }
}

function buildSubscriptionJourney(obligation: ObligationForJourney): GuidedJourneyTemplate {
  const renewsSoon = isDueWithinDays(obligation.dueDate, 14);
  const highSpend = (obligation.amount ?? 0) >= 30;
  const stillUsefulByScore = obligation.importanceScore >= 60;

  const recommendedDecision = !stillUsefulByScore
    ? "cancel"
    : highSpend
      ? "downgrade"
      : "keep";

  return {
    journeyType: "SUBSCRIPTION",
    summary: "Decide whether this subscription should stay active before the next billing cycle.",
    recommendedPath: renewsSoon
      ? "Review usage now, then decide keep/cancel/downgrade before renewal."
      : "Confirm usage first, then decide whether to keep, downgrade, or cancel intentionally.",
    steps: [
      {
        key: "verify_usage",
        title: "Confirm current usage",
        description: "Check whether you still actively use this subscription.",
        whyItMatters: "Subscriptions are easiest to optimize when usage is clear.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "still_use", label: "Still use it regularly" },
          { key: "rarely_use", label: "Use it occasionally" },
          { key: "no_longer_use", label: "No longer use it" }
        ],
        recommendedOption: stillUsefulByScore ? "still_use" : "rarely_use"
      },
      {
        key: "check_renewal_timing",
        title: "Check renewal timing",
        description: "Verify when this renews next and whether action is time-sensitive.",
        whyItMatters: "A timely decision avoids another unwanted charge.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "renews_soon", label: "Renews within 14 days" },
          { key: "renews_later", label: "Renews later" },
          { key: "date_unclear", label: "Renewal date is unclear" }
        ],
        recommendedOption: renewsSoon ? "renews_soon" : "renews_later"
      },
      {
        key: "choose_decision",
        title: "Choose the recommended path",
        description: "Pick the most sensible next direction for this subscription.",
        whyItMatters: "A clear decision prevents repeated review loops.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "keep", label: "Keep as-is" },
          { key: "cancel", label: "Cancel before next renewal" },
          { key: "downgrade", label: "Downgrade plan first" }
        ],
        recommendedOption: recommendedDecision
      },
      {
        key: "finalize",
        title: "Finalize next action",
        description: "Lock in one concrete action so this does not drift.",
        whyItMatters: "Finishing with a specific action lowers mental load.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "do_now", label: "Do this now" },
          { key: "set_reminder", label: "Set reminder with date" },
          { key: "postpone_intentionally", label: "Postpone intentionally" }
        ],
        recommendedOption: renewsSoon ? "do_now" : "set_reminder"
      }
    ]
  };
}

function buildBillJourney(obligation: ObligationForJourney): GuidedJourneyTemplate {
  const dueSoon = isDueWithinDays(obligation.dueDate, 7);
  const highUrgency = obligation.urgencyScore >= 80;
  const amountKnown = (obligation.amount ?? 0) > 0;

  return {
    journeyType: "BILL",
    summary: "Verify the bill, choose handling path, and commit to a concrete next step.",
    recommendedPath: dueSoon || highUrgency
      ? "Verify amount and due date, then prepare payment today."
      : "Verify details now, then set a clear payment or review plan.",
    steps: [
      {
        key: "verify_amount_due_date",
        title: "Verify amount and due date",
        description: "Confirm the amount and when payment is expected.",
        whyItMatters: "Correct details prevent avoidable late fees or surprises.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "looks_correct", label: "Looks correct" },
          { key: "needs_review", label: "Needs review" },
          { key: "possible_error", label: "Possible error" }
        ],
        recommendedOption: amountKnown ? "looks_correct" : "needs_review"
      },
      {
        key: "choose_handling_path",
        title: "Choose handling path",
        description: "Decide whether to pay, review, or dispute.",
        whyItMatters: "Picking one path prevents this bill from lingering.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "pay", label: "Pay" },
          { key: "review", label: "Review statement first" },
          { key: "dispute", label: "Dispute charge" }
        ],
        recommendedOption: dueSoon || highUrgency ? "pay" : "review"
      },
      {
        key: "prepare_execution",
        title: "Prepare execution",
        description: "Set how and when you will complete this.",
        whyItMatters: "A scheduled next action keeps this from returning to your queue.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "do_now", label: "Handle now" },
          { key: "set_reminder", label: "Set a reminder" },
          { key: "postpone_intentionally", label: "Postpone intentionally" }
        ],
        recommendedOption: dueSoon ? "do_now" : "set_reminder"
      },
      {
        key: "finalize",
        title: "Finalize with intention",
        description: "Close this journey with your chosen next action.",
        whyItMatters: "Intentional closure is better than passive delay.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "mark_handled", label: "Mark as handled once done" },
          { key: "keep_active", label: "Keep active with reminder" },
          { key: "dismiss_if_irrelevant", label: "Dismiss if irrelevant" }
        ],
        recommendedOption: "mark_handled"
      }
    ]
  };
}

function buildRenewalJourney(obligation: ObligationForJourney): GuidedJourneyTemplate {
  const expiringSoon = isDueWithinDays(obligation.dueDate, 21);
  const highValue = obligation.importanceScore >= 65;

  return {
    journeyType: "RENEWAL",
    summary: "Evaluate renewal timing and value, then decide renew, replace, or stop.",
    recommendedPath: expiringSoon
      ? "Check renewal timing now and decide before the deadline."
      : "Evaluate value first, then set a clear renew/replace decision.",
    steps: [
      {
        key: "verify_renewal_date",
        title: "Verify renewal date",
        description: "Confirm when this renews or expires.",
        whyItMatters: "Timing determines whether action should happen now.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "date_confirmed", label: "Date confirmed" },
          { key: "date_unclear", label: "Date unclear" },
          { key: "already_renewed", label: "Already renewed elsewhere" }
        ],
        recommendedOption: obligation.dueDate ? "date_confirmed" : "date_unclear"
      },
      {
        key: "assess_need_value_risk",
        title: "Assess need, value, and risk",
        description: "Check whether this is still worth maintaining.",
        whyItMatters: "A quick value check keeps renewals intentional.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "high_value", label: "High value" },
          { key: "mixed_value", label: "Mixed value" },
          { key: "low_value", label: "Low value" }
        ],
        recommendedOption: highValue ? "high_value" : "mixed_value"
      },
      {
        key: "choose_path",
        title: "Choose renewal path",
        description: "Pick renew, replace, or stop.",
        whyItMatters: "A clear path reduces deadline stress and decision churn.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "renew", label: "Renew" },
          { key: "replace", label: "Replace with alternative" },
          { key: "ignore", label: "Do not renew" }
        ],
        recommendedOption: highValue ? "renew" : "replace"
      },
      {
        key: "finalize",
        title: "Finalize with timing",
        description: "Commit to the concrete next action and timing.",
        whyItMatters: "A timed action prevents last-minute decisions.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "do_now", label: "Do this now" },
          { key: "set_reminder", label: "Set reminder before renewal" },
          { key: "postpone_intentionally", label: "Postpone intentionally" }
        ],
        recommendedOption: expiringSoon ? "do_now" : "set_reminder"
      }
    ]
  };
}

function buildCommitmentJourney(obligation: ObligationForJourney): GuidedJourneyTemplate {
  const urgent = obligation.urgencyScore >= 75 || isDueWithinDays(obligation.dueDate, 7);
  const lowEffort = obligation.effortLevel === "LOW";

  return {
    journeyType: "COMMITMENT",
    summary: "Clarify the commitment and decide whether to do, postpone, or dismiss intentionally.",
    recommendedPath: urgent || lowEffort
      ? "Clarify quickly and complete the next action now."
      : "Clarify scope, choose direction, and set support for follow-through.",
    steps: [
      {
        key: "clarify_scope",
        title: "Clarify what done looks like",
        description: "Define the smallest meaningful next action.",
        whyItMatters: "Clear scope lowers friction and decision fatigue.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "clear", label: "Clear next action" },
          { key: "partly_clear", label: "Partly clear" },
          { key: "unclear", label: "Still unclear" }
        ],
        recommendedOption: "clear"
      },
      {
        key: "choose_direction",
        title: "Choose direction",
        description: "Decide whether to do now, postpone, or dismiss.",
        whyItMatters: "Intentional decisions prevent this from repeatedly resurfacing.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "do_now", label: "Do now" },
          { key: "postpone", label: "Postpone intentionally" },
          { key: "dismiss", label: "Dismiss as irrelevant" }
        ],
        recommendedOption: urgent || lowEffort ? "do_now" : "postpone"
      },
      {
        key: "set_support",
        title: "Set support",
        description: "Choose what will help you follow through.",
        whyItMatters: "Support systems reduce the chance of another postpone loop.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "set_reminder", label: "Set reminder" },
          { key: "break_down", label: "Break into smaller action" },
          { key: "no_support", label: "No support needed" }
        ],
        recommendedOption: "set_reminder"
      },
      {
        key: "finalize",
        title: "Finalize next action",
        description: "Confirm your next concrete action before leaving Guided Mode.",
        whyItMatters: "Concrete closure turns intent into momentum.",
        inputType: "SINGLE_SELECT",
        options: [
          { key: "complete_journey", label: "Complete journey now" },
          { key: "continue_later", label: "Continue later with reminder" }
        ],
        recommendedOption: "complete_journey"
      }
    ]
  };
}

function isDueWithinDays(value: string | null | undefined, days: number) {
  if (!value) return false;

  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return false;

  const now = Date.now();
  const diffMs = due.getTime() - now;
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

export function normalizeTemplateSteps(steps: GuidedJourneyTemplateStep[]) {
  return steps.slice(0, 5);
}
