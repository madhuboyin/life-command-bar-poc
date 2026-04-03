import { Request, Response } from "express";
import { ResolutionService } from "../services/resolution.service";
import { fail, ok } from "../utils/api-response";

const service = new ResolutionService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function getResolution(req: Request, res: Response) {
  try {
    const data = await service.getResolution(DEFAULT_USER_ID, req.params.id as string);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, data);
  } catch (error) {
    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not generate resolution", 500);
  }
}
