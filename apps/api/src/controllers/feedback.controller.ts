import { Request, Response } from "express";
import { ZodError } from "zod";
import { FeedbackService } from "../services/feedback.service";
import { fail, ok } from "../utils/api-response";

const service = new FeedbackService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function createFeedback(req: Request, res: Response) {
  try {
    const feedbackEvent = await service.create({
      ...req.body,
      userId: DEFAULT_USER_ID
    });

    return ok(res, { feedbackEvent }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(res, "VALIDATION_ERROR", "Input is invalid", 400, {
        issues: error.issues
      });
    }

    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not save feedback", 500);
  }
}
