import { Request, Response } from "express";
import { ObligationService } from "../services/obligation.service";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new ObligationService();

export async function listObligations(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.list(userId, req.query);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch obligations");
  }
}

export async function getObligationById(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getById(userId, req.params.id as string);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation: data });
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch obligation");
  }
}

export async function createObligation(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.create({
      ...req.body,
      userId
    });

    return ok(res, { obligation: data }, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not create obligation");
  }
}

export async function updateObligation(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.update(userId, req.params.id as string, req.body);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, { obligation: data });
  } catch (error) {
    return handleControllerError(res, error, "Could not update obligation");
  }
}

export async function getObligationHistory(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getHistory(userId, req.params.id as string);

    if (!data) {
      return fail(res, "NOT_FOUND", "Obligation not found", 404);
    }

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch obligation history");
  }
}
