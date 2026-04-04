import { Request, Response } from "express";
import { z } from "zod";
import { PredictionEngineService } from "../services/prediction-engine.service";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new PredictionEngineService();

const predictionParamsSchema = z.object({
  id: z.string().min(1)
});

const listQuerySchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  predictionType: z.union([z.string(), z.array(z.string())]).optional(),
  limit: z.string().optional()
});

export async function listPredictions(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const query = listQuerySchema.parse(req.query);
    const statuses = parseArray(query.status) as Array<
      "ACTIVE" | "CONFIRMED" | "DISMISSED" | "EXPIRED" | "PROMOTED_TO_OBLIGATION"
    >;
    const predictionType = parseArray(query.predictionType) as Array<
      | "RECURRING_NEXT_OCCURRENCE"
      | "UPCOMING_ATTENTION"
      | "WORKLOAD_WINDOW"
      | "MISSING_EXPECTED_OBLIGATION"
    >;

    const data = await service.list(userId, {
      status: statuses.length > 0 ? statuses : undefined,
      predictionType: predictionType.length > 0 ? predictionType : undefined,
      limit: parseLimit(query.limit, 200)
    });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch predictions");
  }
}

export async function listUpcomingPredictions(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.listUpcoming(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch upcoming predictions");
  }
}

export async function getPredictionById(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = predictionParamsSchema.parse(req.params);

    const prediction = await service.getById(userId, params.id);
    if (!prediction) {
      return fail(res, "NOT_FOUND", "Prediction not found", 404);
    }
    return ok(res, { prediction });
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch prediction");
  }
}

export async function rebuildPredictions(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.rebuild(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not rebuild predictions");
  }
}

export async function confirmPrediction(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = predictionParamsSchema.parse(req.params);

    const data = await service.confirm(userId, params.id, req.body ?? {});
    if (!data) {
      return fail(res, "NOT_FOUND", "Prediction not found", 404);
    }
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not confirm prediction");
  }
}

export async function dismissPrediction(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = predictionParamsSchema.parse(req.params);

    const prediction = await service.dismiss(userId, params.id, req.body ?? {});
    if (!prediction) {
      return fail(res, "NOT_FOUND", "Prediction not found", 404);
    }
    return ok(res, { prediction });
  } catch (error) {
    return handleControllerError(res, error, "Could not dismiss prediction");
  }
}

export async function patchPrediction(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = predictionParamsSchema.parse(req.params);

    const prediction = await service.patch(userId, params.id, req.body ?? {});
    if (!prediction) {
      return fail(res, "NOT_FOUND", "Prediction not found", 404);
    }
    return ok(res, { prediction });
  } catch (error) {
    return handleControllerError(res, error, "Could not update prediction");
  }
}

export async function deletePrediction(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = predictionParamsSchema.parse(req.params);

    const deleted = await service.remove(userId, params.id);
    if (!deleted) {
      return fail(res, "NOT_FOUND", "Prediction not found", 404);
    }
    return ok(res, { deleted: true });
  } catch (error) {
    return handleControllerError(res, error, "Could not delete prediction");
  }
}

function parseArray(value: string | string[] | undefined) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLimit(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}
