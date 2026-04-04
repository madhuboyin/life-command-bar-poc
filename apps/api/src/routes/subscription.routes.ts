import { Router } from "express";
import {
  getSubscriptionById,
  listSubscriptions,
  mergeSubscriptions,
  patchSubscription
} from "../controllers/subscription.controller";

export const subscriptionRouter = Router();

subscriptionRouter.get("/", listSubscriptions);
subscriptionRouter.get("/:id", getSubscriptionById);
subscriptionRouter.patch("/:id", patchSubscription);
subscriptionRouter.post("/merge", mergeSubscriptions);
