import { Request, Response } from "express";
import { GuidedJourneyService } from "../services/guided-journey.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new GuidedJourneyService();

export async function createOrResumeGuidedJourney(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.createOrResume(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not start guided journey");
  }
}

export async function getActiveGuidedJourneyForObligation(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getActiveByObligation(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch guided journey");
  }
}

export async function getGuidedJourneyById(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getById(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch guided journey");
  }
}

export async function selectGuidedJourneyOption(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.selectOption(userId, req.params.id as string, req.body ?? {});
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not select journey option");
  }
}

export async function advanceGuidedJourney(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.advance(userId, req.params.id as string, req.body ?? {});
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not advance journey");
  }
}

export async function backGuidedJourney(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.back(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not go back in journey");
  }
}

export async function completeGuidedJourney(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.complete(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not complete journey");
  }
}

export async function abandonGuidedJourney(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.abandon(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not abandon journey");
  }
}

export async function dismissGuidedJourney(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.dismiss(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not dismiss journey");
  }
}
