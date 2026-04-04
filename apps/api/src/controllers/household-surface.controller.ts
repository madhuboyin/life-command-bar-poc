import { Request, Response } from "express";
import { HouseholdSurfaceService } from "../services/household-surface.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new HouseholdSurfaceService();

export async function getHouseholdPulse(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const data = await service.getPulse(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load household pulse");
  }
}

export async function getHouseholdControlTower(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const data = await service.getControlTower(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load household control tower");
  }
}

export async function getHouseholdUpcoming(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const data = await service.getUpcoming(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load household upcoming");
  }
}

export async function getHouseholdReady(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const data = await service.getReady(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load household ready items");
  }
}

export async function getHouseholdRecent(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const data = await service.getRecent(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load household recent items");
  }
}
