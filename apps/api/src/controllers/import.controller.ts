import { Request, Response } from "express";
import { ZodError } from "zod";
import { ImportService } from "../services/import.service";
import { fail, ok } from "../utils/api-response";

const service = new ImportService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function importEmailForward(req: Request, res: Response) {
  try {
    const result = await service.importEmailForward({
      ...req.body,
      userId: DEFAULT_USER_ID
    });

    return ok(res, result, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(res, "VALIDATION_ERROR", "Input is invalid", 400, {
        issues: error.issues
      });
    }

    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not import email forward", 500);
  }
}
