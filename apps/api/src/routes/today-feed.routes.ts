import { Router } from "express";
import { buildBillFlow, buildRenewalFlow, buildSubscriptionFlow } from "@lcb/flows";
import { ObligationType, TodayFeedResponse } from "@lcb/shared";
import { sampleObligations } from "../services/sample-data.service";

export const todayFeedRouter = Router();

todayFeedRouter.get("/", (_req, res) => {
  const items = sampleObligations.slice(0, 3).map((obligation) => {
    let flow;

    switch (obligation.type) {
      case ObligationType.SUBSCRIPTION:
        flow = buildSubscriptionFlow(obligation);
        break;
      case ObligationType.RENEWAL:
        flow = buildRenewalFlow(obligation);
        break;
      case ObligationType.BILL:
      default:
        flow = buildBillFlow(obligation);
        break;
    }

    return {
      obligation,
      whyItMatters: flow.whyItMatters,
      whatToDo: flow.recommendation,
      howHardIsIt: obligation.effortLevel,
      primaryAction: flow.primaryAction,
      secondaryActions: flow.secondaryActions
    };
  });

  const response: TodayFeedResponse = {
    items,
    generatedAt: new Date().toISOString()
  };

  res.json(response);
});
