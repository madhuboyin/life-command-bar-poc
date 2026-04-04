import { Request, Response } from "express";
import { z } from "zod";
import { DailyPulseService } from "../services/daily-pulse.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new DailyPulseService();

const trackActionSchema = z.object({
  action: z.enum(["COMPLETED", "DISMISSED", "POSTPONED"])
});

const itemParamsSchema = z.object({
  obligationId: z.string().min(1)
});

export async function getDailyPulse(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const markOpened = req.query.markOpened === "false" ? false : true;
    const refresh = req.query.refresh === "true";
    const includeTrace = req.query.includeTrace === "true";

    const data = await service.getPulse(userId, { markOpened, refresh, includeTrace });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not build daily pulse");
  }
}

export async function getDailyPulseState(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getPulseState(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch daily pulse state");
  }
}

export async function openDailyPulse(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.openPulse(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not open daily pulse");
  }
}

export async function getDailyPulseProgress(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getProgress(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch daily pulse progress");
  }
}

export async function completeDailyPulseItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = itemParamsSchema.parse(req.params);
    const data = await service.markItemCompleted(userId, params.obligationId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not mark pulse item completed");
  }
}

export async function postponeDailyPulseItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = itemParamsSchema.parse(req.params);
    const data = await service.markItemPostponed(userId, params.obligationId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not mark pulse item postponed");
  }
}

export async function dismissDailyPulseItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = itemParamsSchema.parse(req.params);
    const data = await service.markItemDismissed(userId, params.obligationId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not mark pulse item dismissed");
  }
}

export async function openGuidedDailyPulseItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = itemParamsSchema.parse(req.params);
    const data = await service.markItemOpenedGuided(userId, params.obligationId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not update pulse item guided state");
  }
}

export async function trackDailyPulseAction(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const input = trackActionSchema.parse(req.body ?? {});
    const data = await service.trackAction(userId, input.action);

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not update daily pulse state");
  }
}
