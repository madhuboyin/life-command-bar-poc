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

export async function getDailyPulse(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const markOpened = req.query.markOpened === "false" ? false : true;
    const refresh = req.query.refresh === "true";

    const data = await service.getPulse(userId, { markOpened, refresh });
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
