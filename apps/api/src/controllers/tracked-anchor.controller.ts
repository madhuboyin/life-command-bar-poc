import { AnchorStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { TrackedAnchorService } from "../services/tracked-anchor.service";
import {
  buildTrackedAnchorCreateSuccess,
  mapTrackedAnchor
} from "../utils/tracked-anchor.mapper";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new TrackedAnchorService();

const paramsSchema = z.object({
  id: z.string().min(1)
});

const listQuerySchema = z.object({
  status: z
    .enum(["ACTIVE", "PAUSED", "CANCELLED", "ARCHIVED", "ALL"])
    .optional()
});

const snoozeSchema = z.object({
  until: z.string().datetime()
});

export async function createTrackedAnchor(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const created = await service.createAnchor(userId, req.body ?? {});
    const active = await service.listActiveForUser(userId);
    const duplicate = active.find(
      (item) =>
        item.id !== created.id &&
        item.normalizedLabel &&
        item.normalizedLabel === created.normalizedLabel
    );

    return ok(
      res,
      {
        item: mapTrackedAnchor(created),
        success: buildTrackedAnchorCreateSuccess(created),
        duplicateHint: duplicate
          ? {
              message:
                "This looks similar to something we're already watching for you.",
              similarItemLabel: duplicate.label
            }
          : null
      },
      201
    );
  } catch (error) {
    return handleControllerError(res, error, "Could not start tracking this yet");
  }
}

export async function listTrackedAnchors(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const query = listQuerySchema.parse(req.query);
    const status = query.status ?? "ACTIVE";

    const items = await service.listForUser(userId, {
      status: status as AnchorStatus | "ALL"
    });

    return ok(res, {
      items: items.map(mapTrackedAnchor),
      statusFilter: status
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not load tracked items");
  }
}

export async function getTrackedAnchorById(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = paramsSchema.parse(req.params);

    const item = await service.getAnchorForUser(params.id, userId);
    if (!item) {
      return fail(res, "NOT_FOUND", "Couldn't find that item", 404);
    }

    return ok(res, { item: mapTrackedAnchor(item) });
  } catch (error) {
    return handleControllerError(res, error, "Could not load tracked item");
  }
}

export async function updateTrackedAnchor(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = paramsSchema.parse(req.params);

    const item = await service.updateAnchor(userId, params.id, req.body ?? {});
    if (!item) {
      return fail(res, "NOT_FOUND", "Couldn't find that item", 404);
    }

    return ok(res, {
      item: mapTrackedAnchor(item),
      message: "Updated. We'll keep watching this for you."
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not update tracked item");
  }
}

export async function pauseTrackedAnchor(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = paramsSchema.parse(req.params);

    const item = await service.pauseAnchor(params.id, userId);
    if (!item) {
      return fail(res, "NOT_FOUND", "Couldn't find that item", 404);
    }

    return ok(res, {
      item: mapTrackedAnchor(item),
      message: "Paused. We won't bring this up until you restart it."
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not pause tracked item");
  }
}

export async function cancelTrackedAnchor(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = paramsSchema.parse(req.params);

    const item = await service.cancelAnchor(params.id, userId);
    if (!item) {
      return fail(res, "NOT_FOUND", "Couldn't find that item", 404);
    }

    return ok(res, {
      item: mapTrackedAnchor(item),
      message: "Canceled. We'll stop watching this."
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not cancel tracked item");
  }
}

export async function archiveTrackedAnchor(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = paramsSchema.parse(req.params);

    const item = await service.archiveAnchor(params.id, userId);
    if (!item) {
      return fail(res, "NOT_FOUND", "Couldn't find that item", 404);
    }

    return ok(res, {
      item: mapTrackedAnchor(item),
      message: "Archived."
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not archive tracked item");
  }
}

export async function snoozeTrackedAnchor(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = paramsSchema.parse(req.params);
    const input = snoozeSchema.parse(req.body ?? {});

    const item = await service.snoozeAnchor(params.id, userId, input.until);
    if (!item) {
      return fail(res, "NOT_FOUND", "Couldn't find that item", 404);
    }

    return ok(res, {
      item: mapTrackedAnchor(item),
      message: "Okay, we'll wait and bring this back later."
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not snooze tracked item");
  }
}
