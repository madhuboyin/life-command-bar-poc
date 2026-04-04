import { Request, Response } from "express";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";
import { SubscriptionRegistryService } from "../services/subscription-registry.service";

const service = new SubscriptionRegistryService();

export async function listSubscriptions(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.list(userId, {
      limit: parseNumber(req.query.limit, 25, 1, 100),
      offset: parseNumber(req.query.offset, 0, 0, 10000),
      lifecycleState:
        typeof req.query.lifecycleState === "string"
          ? req.query.lifecycleState
          : undefined
    });

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load subscriptions");
  }
}

export async function getSubscriptionById(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getById(userId, req.params.id as string);
    if (!data) {
      return fail(res, "NOT_FOUND", "Subscription not found", 404);
    }
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load subscription");
  }
}

export async function patchSubscription(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.patch(userId, req.params.id as string, req.body ?? {});
    if (!data) {
      return fail(res, "NOT_FOUND", "Subscription not found", 404);
    }
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not update subscription");
  }
}

export async function mergeSubscriptions(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.merge(userId, req.body ?? {});
    if (!data) {
      return fail(res, "NOT_FOUND", "Subscription not found", 404);
    }
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not merge subscriptions");
  }
}

function parseNumber(
  value: unknown,
  fallback: number,
  minValue: number,
  maxValue: number
) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < minValue) return minValue;
  if (rounded > maxValue) return maxValue;
  return rounded;
}
