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
  note: z.string().max(500).nullable().optional(),
  handoffToGuided: z.boolean().optional(),
  decisionDurationMs: z.number().int().min(0).max(600_000).optional()
});

export async function getSubscriptionReviewHub(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await reviewService.getReviewHub(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load subscription review hub");
  }
}

export async function getSubscriptionReviewFlow(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await decisionFlowService.getReviewFlow(userId, req.params.id as string);
    if (!data) {
      return fail(res, "NOT_FOUND", "Subscription not found", 404);
    }
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
    const subscriptionId = req.params.id as string;
    const data =
      payload.action === "KEEP"
        ? await decisionActionService.keep(userId, subscriptionId, {
            note: payload.note,
            decisionDurationMs: payload.decisionDurationMs
          })
        : payload.action === "CANCEL"
          ? await decisionActionService.cancel(userId, subscriptionId, {
              note: payload.note,
              handoffToGuided: payload.handoffToGuided,
              decisionDurationMs: payload.decisionDurationMs
            })
          : payload.action === "REMIND_LATER"
            ? await decisionActionService.remindLater(userId, subscriptionId, {
                remindAt: payload.remindAt,
                note: payload.note,
                decisionDurationMs: payload.decisionDurationMs
              })
            : await decisionActionService.markReviewed(userId, subscriptionId, {
                context: "COMPLETED",
                note: payload.note,
                decisionDurationMs: payload.decisionDurationMs
              });

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not apply subscription review action");
  }
}
