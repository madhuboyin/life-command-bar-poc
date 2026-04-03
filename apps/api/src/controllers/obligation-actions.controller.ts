import { Request, Response } from "express";
import { ZodError } from "zod";
import { ObligationActionsService } from "../services/obligation-actions.service";
import { fail, ok } from "../utils/api-response";

const service = new ObligationActionsService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function markObligationDone(req: Request, res: Response) {
  try {
    const obligation = await service.markDone(
      DEFAULT_USER_ID,
      req.params.id as string,
      req.body ?? {}
    );

    if (!obligation) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function dismissObligation(req: Request, res: Response) {
  try {
    const obligation = await service.dismiss(
      DEFAULT_USER_ID,
      req.params.id as string,
      req.body ?? {}
    );

    if (!obligation) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function postponeObligation(req: Request, res: Response) {
  try {
    const obligation = await service.postpone(
      DEFAULT_USER_ID,
      req.params.id as string,
      req.body ?? {}
    );

    if (!obligation) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation });
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
