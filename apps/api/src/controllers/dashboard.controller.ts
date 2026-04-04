import { Request, Response } from "express";
import { DashboardInsightsService } from "../services/dashboard-insights.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new DashboardInsightsService();

export async function getDashboardInsights(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const includeTrace = req.query.includeTrace === "true";
    const data = await service.getInsights(userId, { includeTrace });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not build dashboard insights");
  }
}
