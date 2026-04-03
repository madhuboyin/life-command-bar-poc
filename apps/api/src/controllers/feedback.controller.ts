import { Request, Response } from "express";
import { FeedbackService } from "../services/feedback.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new FeedbackService();

export async function createFeedback(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const feedbackEvent = await service.create({
      ...req.body,
      userId
    });

    return ok(res, { feedbackEvent }, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not save feedback");
  }
}
