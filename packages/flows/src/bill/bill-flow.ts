import { Obligation } from "@lcb/shared";
import { ResolutionFlowResult } from "../types";

export function buildBillFlow(obligation: Obligation): ResolutionFlowResult {
  return {
    flowKey: "bill.default",
    recommendation: `Review and prepare to handle ${obligation.title}.`,
    whyItMatters: "Bills can create penalties or stress if left unattended.",
    steps: [
      "Confirm due date and amount.",
      "Check whether the amount looks expected.",
      "Prepare payment or review."
    ],
    primaryAction: "Review bill",
    secondaryActions: ["Remind me later", "Mark as handled"]
  };
}
