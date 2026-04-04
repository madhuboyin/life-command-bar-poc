import { MemoryEntityType, MemoryPatternType } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { HomeMemoryService } from "../services/home-memory.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new HomeMemoryService();

const listEntitiesQuerySchema = z.object({
  type: z.nativeEnum(MemoryEntityType).optional(),
  limit: z.string().optional()
});

const listPatternsQuerySchema = z.object({
  patternType: z.nativeEnum(MemoryPatternType).optional(),
  referenceId: z.string().optional(),
  includeSuppressed: z.string().optional(),
  limit: z.string().optional()
});

const patternParamsSchema = z.object({
  id: z.string().min(1)
});

export async function listMemoryEntities(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const query = listEntitiesQuerySchema.parse(req.query);
    const limit = parseLimit(query.limit, 200);

    const data = await service.listEntities(userId, {
      type: query.type,
      limit
    });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch memory entities");
  }
}

export async function listMemoryPatterns(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const query = listPatternsQuerySchema.parse(req.query);
    const limit = parseLimit(query.limit, 250);

    const data = await service.listPatterns(userId, {
      patternType: query.patternType,
      referenceId: query.referenceId,
      includeSuppressed: query.includeSuppressed === "true",
      limit
    });
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch memory patterns");
  }
}

export async function getMemoryContext(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getContext(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch memory context");
  }
}

export async function getMemorySummary(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getSummary(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch memory summary");
  }
}

export async function rebuildMemory(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.rebuild(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not rebuild memory");
  }
}

export async function updateMemoryPattern(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = patternParamsSchema.parse(req.params);

    const pattern = await service.updatePattern(userId, params.id, req.body ?? {});
    return ok(res, { pattern });
  } catch (error) {
    return handleControllerError(res, error, "Could not update memory pattern");
  }
}

export async function deleteMemoryPattern(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const params = patternParamsSchema.parse(req.params);

    await service.deletePattern(userId, params.id);
    return ok(res, { deleted: true });
  } catch (error) {
    return handleControllerError(res, error, "Could not delete memory pattern");
  }
}

function parseLimit(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}
