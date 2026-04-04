import { Request, Response } from "express";
import { PersonalizationService } from "../services/personalization.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new PersonalizationService();

export async function getPersonalizationSummary(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getSummary(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch personalization summary");
  }
}

export async function getPersonalizationDebug(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getDebug(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch personalization debug data");
  }
}
