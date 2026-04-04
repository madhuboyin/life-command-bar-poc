import { Request, Response } from "express";
import { z } from "zod";
import { ok } from "../utils/api-response";
import { getRequiredUserId } from "../utils/request-user";
import { handleControllerError } from "../utils/handle-controller-error";
import { FlowSessionService } from "../services/flow-session.service";

const service = new FlowSessionService();

const idParamsSchema = z.object({
  id: z.string().min(1)
});

export async function createOrResumeFlowSession(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.createOrResume(userId, req.body ?? {});
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not start flow session");
  }
}

export async function getFlowSessionById(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = idParamsSchema.parse(req.params);
    const data = await service.getById(userId, params.id);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch flow session");
  }
}

export async function completeFlowSessionStep(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = idParamsSchema.parse(req.params);
    const data = await service.completeStep(userId, params.id, req.body ?? {});
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not complete flow step");
  }
}

export async function moveFlowSessionNext(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = idParamsSchema.parse(req.params);
    const data = await service.next(userId, params.id, req.body ?? {});
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not move to next flow item");
  }
}

export async function abandonFlowSession(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = idParamsSchema.parse(req.params);
    const data = await service.abandon(userId, params.id);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not abandon flow session");
  }
}
