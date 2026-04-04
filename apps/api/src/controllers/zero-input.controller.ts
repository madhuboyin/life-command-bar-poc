import { Request, Response } from "express";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";
import { ZeroInputService } from "../services/zero-input.service";

const service = new ZeroInputService();

export async function getZeroInputPolicy(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const policy = await service.getPolicy(userId);
    return ok(res, { policy });
  } catch (error) {
    return handleControllerError(res, error, "Could not load zero-input policy");
  }
}

export async function patchZeroInputPolicy(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const policy = await service.patchPolicy(userId, req.body ?? {});
    return ok(res, { policy });
  } catch (error) {
    return handleControllerError(res, error, "Could not update zero-input policy");
  }
}

export async function listZeroInputDecisions(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.listDecisions(userId, {
      limit: parseLimit(req.query.limit, 50, 1, 200),
      decision: parseArray(req.query.decision) as Array<
        "EXECUTED" | "REVIEW" | "APPROVAL_REQUIRED" | "SUPPRESSED"
      >,
      approvalStatus: parseArray(req.query.approvalStatus) as Array<
        "NONE" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "UNDONE"
      >
    });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load zero-input decisions");
  }
}

export async function listZeroInputApprovals(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const data = await service.listApprovals(userId, parseLimit(req.query.limit, 20, 1, 100));
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load zero-input approvals");
  }
}

export async function approveZeroInputDecision(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const decision = await service.approve(userId, req.params.id as string, req.body ?? {});
    if (!decision) {
      return fail(res, "NOT_FOUND", "Approval decision not found", 404);
    }

    return ok(res, { decision });
  } catch (error) {
    return handleControllerError(res, error, "Could not approve zero-input action");
  }
}

export async function rejectZeroInputDecision(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const decision = await service.reject(userId, req.params.id as string, req.body ?? {});
    if (!decision) {
      return fail(res, "NOT_FOUND", "Approval decision not found", 404);
    }

    return ok(res, { decision });
  } catch (error) {
    return handleControllerError(res, error, "Could not reject zero-input action");
  }
}

export async function undoZeroInputDecision(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const decision = await service.undo(userId, req.params.id as string, req.body ?? {});
    if (!decision) {
      return fail(res, "NOT_FOUND", "Decision not found", 404);
    }

    return ok(res, { decision });
  } catch (error) {
    return handleControllerError(res, error, "Could not undo zero-input action");
  }
}

function parseLimit(value: unknown, fallback: number, minValue: number, maxValue: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < minValue) return minValue;
  if (rounded > maxValue) return maxValue;
  return rounded;
}

function parseArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
