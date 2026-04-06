import { Request, Response } from "express";
import { z } from "zod";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

import { SubscriptionReviewService } from "../services/subscription-review.service";
import { SubscriptionDecisionFlowService } from "../services/subscription-decision-flow.service";
import { SubscriptionDecisionActionService } from "../services/subscription-decision-action.service";

const reviewService = new SubscriptionReviewService();
const decisionFlowService = new SubscriptionDecisionFlowService();
const decisionActionService = new SubscriptionDecisionActionService();

const actionSchema = z.object({
  action: z.enum(["KEEP", "CANCEL", "REMIND_LATER", "REVIEWED"]),
  remindAt: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional()
});

export async function getSubscriptionReviewHub(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await reviewService.getReviewHubData(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load subscription review hub");
  }
}

export async function getSubscriptionReviewFlow(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await decisionFlowService.getDecisionFlow(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load subscription review flow details");
  }
}

export async function applySubscriptionReviewAction(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const payload = actionSchema.parse(req.body ?? {});
    const data = await decisionActionService.executeAction(userId, req.params.id as string, {
        action: payload.action,
        remindAt: payload.remindAt,
        note: payload.note
    });
    
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not apply subscription review action");
  }
}
