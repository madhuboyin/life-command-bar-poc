import { Request, Response } from "express";
import { z } from "zod";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";
import { FocusModeService } from "../services/focus-mode.service";

const service = new FocusModeService();

const sessionParamsSchema = z.object({
  id: z.string().min(1)
});

const sessionItemParamsSchema = z.object({
  id: z.string().min(1),
  obligationId: z.string().min(1)
});

export async function createFocusSession(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.createSession({
      ...req.body,
      userId
    });
    return ok(res, data, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not create focus session");
  }
}

export async function getActiveFocusSession(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getActiveSession(userId);
    if (!data) {
      return fail(res, "NOT_FOUND", "No active focus session", 404);
    }

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch active focus session");
  }
}

export async function getFocusSessionById(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionParamsSchema.parse(req.params);
    const data = await service.getById(userId, params.id);

    if (!data) {
      return fail(res, "NOT_FOUND", "Focus session not found", 404);
    }

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch focus session");
  }
}

export async function startFocusSession(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionParamsSchema.parse(req.params);
    const data = await service.startSession(userId, params.id);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not start focus session");
  }
}

export async function completeFocusSessionItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionItemParamsSchema.parse(req.params);
    const data = await service.completeItem(userId, params.id, params.obligationId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not complete focus session item");
  }
}

export async function postponeFocusSessionItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionItemParamsSchema.parse(req.params);
    const data = await service.postponeItem(
      userId,
      params.id,
      params.obligationId,
      req.body ?? {}
    );
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not postpone focus session item");
  }
}

export async function dismissFocusSessionItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionItemParamsSchema.parse(req.params);
    const data = await service.dismissItem(
      userId,
      params.id,
      params.obligationId,
      req.body ?? {}
    );
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not dismiss focus session item");
  }
}

export async function skipFocusSessionItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionItemParamsSchema.parse(req.params);
    const data = await service.skipItem(userId, params.id, params.obligationId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not skip focus session item");
  }
}

export async function nextFocusSessionItem(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionParamsSchema.parse(req.params);
    const data = await service.next(userId, params.id);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not move focus session to next item");
  }
}

export async function completeFocusSession(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionParamsSchema.parse(req.params);
    const data = await service.completeSession(userId, params.id);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not complete focus session");
  }
}

export async function abandonFocusSession(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const params = sessionParamsSchema.parse(req.params);
    const data = await service.abandonSession(userId, params.id);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not abandon focus session");
  }
}
