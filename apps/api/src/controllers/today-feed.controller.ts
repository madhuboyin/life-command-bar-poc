import { Request, Response } from "express";
import { TodayFeedService } from "../services/today-feed.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new TodayFeedService();

export async function getTodayFeed(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getTodayFeed(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not build today feed");
  }
}
