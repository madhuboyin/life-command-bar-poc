import { Obligation } from "@lcb/shared";
import { ResolutionFlowResult } from "../types";

export function buildRenewalFlow(obligation: Obligation): ResolutionFlowResult {
  return {
    flowKey: "renewal.default",
    recommendation: `Decide whether to renew ${obligation.title}.`,
    whyItMatters: "Renewals are easy to miss and often require a simple but timely decision.",
    steps: [
      "Check the renewal date.",
      "Evaluate whether it is still worth keeping.",
      "Prepare renew / replace / ignore decision."
    ],
    primaryAction: "Review renewal",
    secondaryActions: ["Renew later", "Ignore for now"]
  };
}
