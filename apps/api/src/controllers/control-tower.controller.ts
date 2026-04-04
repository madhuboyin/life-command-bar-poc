import { Request, Response } from "express";
import { ControlTowerService } from "../services/control-tower.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new ControlTowerService();

export async function getControlTower(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getControlTower(userId, {
      reviewLimit: parseLimit(req.query.reviewLimit, 6, 1, 20),
      readyLimit: parseLimit(req.query.readyLimit, 6, 1, 20),
      upcomingLimitPerWindow: parseLimit(req.query.upcomingLimitPerWindow, 4, 1, 12),
      recentLimit: parseLimit(req.query.recentLimit, 6, 1, 20),
      systemDecisionsLimit: parseLimit(req.query.systemDecisionsLimit, 6, 1, 20)
    });

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load control tower");
  }
}

export async function getControlTowerReview(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getReview(userId, parseLimit(req.query.limit, 6, 1, 30));
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load control tower review");
  }
}

export async function getControlTowerReady(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getReady(userId, parseLimit(req.query.limit, 6, 1, 30));
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load control tower ready items");
  }
}

export async function getControlTowerUpcoming(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getUpcoming(
      userId,
      parseLimit(req.query.limitPerWindow, 4, 1, 12)
    );
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load control tower upcoming");
  }
}

export async function getControlTowerRecent(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getRecent(userId, parseLimit(req.query.limit, 6, 1, 30));
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load control tower recent items");
  }
}

export async function getControlTowerSystemDecisions(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getSystemDecisions(
      userId,
      parseLimit(req.query.limit, 6, 1, 30)
    );
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load control tower decisions");
  }
}

function parseLimit(value: unknown, fallback: number, minValue: number, maxValue: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;

  const rounded = Math.floor(parsed);
  if (rounded < minValue) return minValue;
  if (rounded > maxValue) return maxValue;
  return rounded;
}
