import { Request, Response } from "express";
import { ZodError } from "zod";
import { CommandService } from "../services/command.service";
import { fail, ok } from "../utils/api-response";

const service = new CommandService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function parseCommand(req: Request, res: Response) {
  try {
    const parsed = service.parse(req.body);
    return ok(res, parsed);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function executeCommand(req: Request, res: Response) {
  try {
    const result = await service.execute(DEFAULT_USER_ID, req.body);
    return ok(res, result);
  } catch (error) {
    return handleError(res, error);
  }
}

function handleError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return fail(res, "VALIDATION_ERROR", "Input is invalid", 400, {
      issues: error.issues
    });
  }

  console.error(error);
  return fail(res, "INTERNAL_ERROR", "Unexpected server error", 500);
}
