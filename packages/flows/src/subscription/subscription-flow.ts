import { Obligation } from "@lcb/shared";
import { ResolutionFlowResult } from "../types";

export function buildSubscriptionFlow(obligation: Obligation): ResolutionFlowResult {
  return {
    flowKey: "subscription.default",
    recommendation: `Review ${obligation.title} before the next renewal.`,
    whyItMatters: "Recurring subscriptions are easy to ignore and can quietly add up.",
    steps: [
      "Check the next billing date.",
      "Review recent usage and perceived value.",
      "Decide whether to keep, downgrade, or cancel."
    ],
    primaryAction: "Review subscription",
    secondaryActions: ["Keep for now", "Cancel later"]
  };
}
