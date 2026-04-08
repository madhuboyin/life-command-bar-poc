import { Request, Response } from "express";
import { z } from "zod";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";
import { DailyCommandCenterService } from "../services/daily-command-center.service";
import { TodayActionLoopService } from "../services/today-action-loop.service";

const commandCenterService = new DailyCommandCenterService();
const actionLoopService = new TodayActionLoopService();

const itemParamsSchema = z.object({
  id: z.string().min(1)
});

const actionSchema = z.object({
  actionKey: z.enum([
    "MARK_DONE",
    "REMIND_LATER",
    "DISMISS",
    "OPEN_GUIDED",
    "REVIEW",
    "REVIEW_SUBSCRIPTION",
    "VIEW_DETAILS"
  ]),
  remindAt: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional()
});

export async function getTodayView(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await commandCenterService.getTodayView(userId, {
      emitEvents: true
    });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load daily command center");
  }
}

export async function applyTodayItemAction(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = itemParamsSchema.parse(req.params);
    const input = actionSchema.parse(req.body ?? {});

    const data = await actionLoopService.executeAction(userId, params.id, input);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not apply today action");
  }
}
