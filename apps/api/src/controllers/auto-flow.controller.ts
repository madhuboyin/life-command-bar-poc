import { Request, Response } from "express";
import { z } from "zod";
import { AutoFlowService } from "../services/auto-flow.service";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new AutoFlowService();

const idParamsSchema = z.object({
  id: z.string().min(1)
});

const dismissSchema = z.object({
  reason: z.string().optional()
});

export async function listAutoFlow(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const limit =
      typeof req.query.limit === "string" && Number.isFinite(Number(req.query.limit))
        ? Math.max(1, Math.min(100, Math.floor(Number(req.query.limit))))
        : 20;
    const includeAccepted = req.query.includeAccepted === "true";

    const data = await service.list(userId, { limit, includeAccepted });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch auto-flow items");
  }
}

export async function triggerAutoFlow(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.trigger({
      ...req.body,
      userId
    });
    return ok(res, data, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not trigger auto-flow");
  }
}

export async function acceptAutoFlow(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = idParamsSchema.parse(req.params);
    const item = await service.accept(userId, params.id);

    if (!item) {
      return fail(res, "NOT_FOUND", "Auto-flow item not found", 404);
    }

    return ok(res, { item });
  } catch (error) {
    return handleControllerError(res, error, "Could not accept auto-flow");
  }
}

export async function dismissAutoFlow(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = idParamsSchema.parse(req.params);
    const input = dismissSchema.parse(req.body ?? {});
    const item = await service.dismiss(userId, params.id, input.reason);

    if (!item) {
      return fail(res, "NOT_FOUND", "Auto-flow item not found", 404);
    }

    return ok(res, { item });
  } catch (error) {
    return handleControllerError(res, error, "Could not dismiss auto-flow");
  }
}
