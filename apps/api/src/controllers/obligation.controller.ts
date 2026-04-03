import { Request, Response } from "express";
import { ZodError } from "zod";
import { ObligationService } from "../services/obligation.service";
import { fail, ok } from "../utils/api-response";

const service = new ObligationService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function listObligations(req: Request, res: Response) {
  try {
    const data = await service.list(DEFAULT_USER_ID, req.query);
    return ok(res, data);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getObligationById(req: Request, res: Response) {
  try {
    const data = await service.getById(DEFAULT_USER_ID, req.params.id);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation: data });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function createObligation(req: Request, res: Response) {
  try {
    const data = await service.create({
      ...req.body,
      userId: DEFAULT_USER_ID
    });

    return ok(res, { obligation: data }, 201);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateObligation(req: Request, res: Response) {
  try {
    const data = await service.update(DEFAULT_USER_ID, req.params.id, req.body);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation: data });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getObligationHistory(req: Request, res: Response) {
  try {
    const data = await service.getHistory(DEFAULT_USER_ID, req.params.id);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, data);
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
