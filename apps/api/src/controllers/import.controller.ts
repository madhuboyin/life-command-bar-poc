import { Request, Response } from "express";
import { ImportService } from "../services/import.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new ImportService();

export async function importEmailForward(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const result = await service.importEmailForward({
      ...req.body,
      userId
    });

    return ok(res, result, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not import email forward");
  }
}
