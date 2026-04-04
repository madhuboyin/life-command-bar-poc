import { Router } from "express";
import {
  applySubscriptionDecision,
  getSubscriptionById,
  getSubscriptionGuidedReviewFlow,
  getSubscriptionOptimization,
  listSubscriptions,
  mergeSubscriptions,
  patchSubscription
} from "../controllers/subscription.controller";

export const subscriptionRouter = Router();

subscriptionRouter.get("/", listSubscriptions);
subscriptionRouter.get("/:id", getSubscriptionById);
subscriptionRouter.get("/:id/optimization", getSubscriptionOptimization);
subscriptionRouter.get("/:id/review-flow", getSubscriptionGuidedReviewFlow);
subscriptionRouter.patch("/:id", patchSubscription);
subscriptionRouter.post("/:id/decision", applySubscriptionDecision);
subscriptionRouter.post("/merge", mergeSubscriptions);
