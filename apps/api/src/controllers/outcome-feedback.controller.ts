import { Request, Response } from "express";
import { OutcomeFeedbackService } from "../services/outcome-feedback.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new OutcomeFeedbackService();

export async function createOutcomeFeedback(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const outcomeFeedback = await service.create({
      ...req.body,
      userId
    });

    return ok(res, { outcomeFeedback }, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not save outcome feedback");
  }
}
