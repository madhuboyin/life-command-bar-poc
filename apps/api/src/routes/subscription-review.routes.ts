import { Router } from "express";
import {
  getSubscriptionReviewHub,
  getSubscriptionReviewFlow,
  applySubscriptionReviewAction
} from "../controllers/subscription-review.controller";

export const subscriptionReviewRouter = Router();

subscriptionReviewRouter.get("/", getSubscriptionReviewHub);
subscriptionReviewRouter.get("/:id/review-flow", getSubscriptionReviewFlow);
subscriptionReviewRouter.post("/:id/review-actions", applySubscriptionReviewAction);
