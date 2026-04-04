import { SubscriptionRecommendationType } from "@prisma/client";
import type {
  SubscriptionInsightRecord,
  SubscriptionOptimizationRecord
} from "./subscription-insight-types";

export type SubscriptionFlowDecision = "KEEP" | "CANCEL" | "DOWNGRADE" | "REVIEW" | "REMIND_LATER";

export type SubscriptionGuidedFlow = {
  flowId: string;
  subscriptionId: string;
  title: string;
  recommendedDecision: SubscriptionRecommendationType;
  steps: Array<{
    key: string;
    title: string;
    description: string;
    options: Array<{
      key: string;
      label: string;
      description: string;
      recommended?: boolean;
    }>;
  }>;
};

export function buildSubscriptionGuidedFlow(input: {
  subscription: {
    id: string;
    subscriptionTitle: string;
    vendorName: string;
    planName: string | null;
    recurringPrice: number | null;
    currency: string | null;
    nextRenewalDate: string | null;
    lifecycleState: string;
  };
  optimization: SubscriptionOptimizationRecord;
}) {
  const recommendation = input.optimization.recommendation;
  const keyInsights = summarizeInsights(input.optimization.insights);
  const renewalLine = input.subscription.nextRenewalDate
    ? `Renews on ${input.subscription.nextRenewalDate.slice(0, 10)}.`
    : "Renewal date is not confirmed yet.";
  const priceLine =
    input.subscription.recurringPrice !== null
      ? `Current recurring price: ${formatMoney(
          input.subscription.recurringPrice,
          input.subscription.currency
        )}.`
      : "Recurring price is not fully confirmed yet.";

  return {
    flowId: `subscription-review:${input.subscription.id}`,
    subscriptionId: input.subscription.id,
    title: `Review ${input.subscription.subscriptionTitle}`,
    recommendedDecision: recommendation.recommendationType,
    steps: [
      {
        key: "confirm_details",
        title: "Confirm subscription details",
        description: [
          `Vendor: ${input.subscription.vendorName}.`,
          input.subscription.planName ? `Plan: ${input.subscription.planName}.` : "Plan name not confirmed.",
          `Lifecycle state: ${input.subscription.lifecycleState.toLowerCase()}.`
        ].join(" "),
        options: [
          {
            key: "details_correct",
            label: "Looks correct",
            description: "Current subscription details look accurate.",
            recommended: true
          },
          {
            key: "details_need_edit",
            label: "Needs edits",
            description: "Vendor, plan, or lifecycle details need correction."
          }
        ]
      },
      {
        key: "confirm_price_renewal",
        title: "Confirm price and renewal",
        description: `${priceLine} ${renewalLine}`,
        options: [
          {
            key: "price_renewal_correct",
            label: "Confirmed",
            description: "Price and renewal timing look right.",
            recommended: true
          },
          {
            key: "price_renewal_uncertain",
            label: "Not sure",
            description: "Price or renewal timing is uncertain."
          }
        ]
      },
      {
        key: "usage_check",
        title: "Are you still using this?",
        description:
          keyInsights.length > 0
            ? `Signal summary: ${keyInsights.join(" · ")}`
            : "No strong risk signals found recently.",
        options: [
          {
            key: "using_yes",
            label: "Yes",
            description: "Still actively using this subscription.",
            recommended: recommendation.recommendationType === "KEEP"
          },
          {
            key: "using_unsure",
            label: "Not sure",
            description: "Need a quick review before deciding."
          },
          {
            key: "using_no",
            label: "No",
            description: "Not using enough to justify cost.",
            recommended:
              recommendation.recommendationType === "CANCEL" ||
              recommendation.recommendationType === "DOWNGRADE"
          }
        ]
      },
      {
        key: "decision",
        title: "Choose action",
        description: recommendation.reason,
        options: buildDecisionOptions(recommendation.recommendationType)
      }
    ]
  } satisfies SubscriptionGuidedFlow;
}

function buildDecisionOptions(recommended: SubscriptionRecommendationType) {
  const options = [
    {
      key: "KEEP" as SubscriptionFlowDecision,
      label: "Keep",
      description: "Mark as safe and continue monitoring."
    },
    {
      key: "CANCEL" as SubscriptionFlowDecision,
      label: "Cancel",
      description: "Mark for cancellation follow-up."
    },
    {
      key: "DOWNGRADE" as SubscriptionFlowDecision,
      label: "Downgrade",
      description: "Create a downgrade review action."
    },
    {
      key: "REVIEW" as SubscriptionFlowDecision,
      label: "Review later",
      description: "Send this to review without final decision."
    },
    {
      key: "REMIND_LATER" as SubscriptionFlowDecision,
      label: "Remind me later",
      description: "Create a reminder and revisit later."
    }
  ];

  return options.map((option) => ({
    ...option,
    recommended:
      (option.key === "KEEP" && recommended === "KEEP") ||
      (option.key === "CANCEL" && recommended === "CANCEL") ||
      (option.key === "DOWNGRADE" && recommended === "DOWNGRADE") ||
      (option.key === "REVIEW" && recommended === "REVIEW")
  }));
}

function summarizeInsights(insights: SubscriptionInsightRecord[]) {
  return insights
    .slice(0, 3)
    .map((item) => item.title)
    .filter((value) => value.length > 0);
}

function formatMoney(amount: number, currency: string | null) {
  return `${(currency ?? "USD").toUpperCase()} ${amount.toFixed(2)}`;
}

