import { Router } from "express";
import {
  applySubscriptionReviewCancel,
  applySubscriptionReviewKeep,
  applySubscriptionReviewRemind,
  applySubscriptionDecision,
  getSubscriptionReviewHub,
  getSubscriptionById,
  getSubscriptionGuidedReviewFlow,
  getSubscriptionOptimization,
  listSubscriptions,
  markSubscriptionReviewItem,
  mergeSubscriptions,
  patchSubscription
} from "../controllers/subscription.controller";

export const subscriptionRouter = Router();

subscriptionRouter.get("/", listSubscriptions);
subscriptionRouter.get("/review", getSubscriptionReviewHub);
subscriptionRouter.get("/:id", getSubscriptionById);
subscriptionRouter.get("/:id/optimization", getSubscriptionOptimization);
subscriptionRouter.get("/:id/review-flow", getSubscriptionGuidedReviewFlow);
subscriptionRouter.post("/:id/review-actions/keep", applySubscriptionReviewKeep);
subscriptionRouter.post("/:id/review-actions/cancel", applySubscriptionReviewCancel);
subscriptionRouter.post("/:id/review-actions/remind", applySubscriptionReviewRemind);
subscriptionRouter.post("/:id/review-actions/reviewed", markSubscriptionReviewItem);
subscriptionRouter.patch("/:id", patchSubscription);
subscriptionRouter.post("/:id/decision", applySubscriptionDecision);
subscriptionRouter.post("/merge", mergeSubscriptions);
