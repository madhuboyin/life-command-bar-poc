import { Request, Response } from "express";
import { ObligationActionsService } from "../services/obligation-actions.service";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new ObligationActionsService();

export async function markObligationDone(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const obligation = await service.markDone(
      userId,
      req.params.id as string,
      req.body ?? {}
    );

    if (!obligation) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function dismissObligation(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const obligation = await service.dismiss(
      userId,
      req.params.id as string,
      req.body ?? {}
    );

    if (!obligation) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function postponeObligation(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const obligation = await service.postpone(
      userId,
      req.params.id as string,
      req.body ?? {}
    );

    if (!obligation) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation });
  } catch (error) {
    return handleControllerError(res, error);
  }
}
