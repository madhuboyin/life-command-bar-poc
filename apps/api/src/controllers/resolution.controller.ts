import { Request, Response } from "express";
import { ResolutionService } from "../services/resolution.service";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new ResolutionService();

export async function getResolution(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getResolution(userId, req.params.id as string);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not generate resolution");
  }
}
