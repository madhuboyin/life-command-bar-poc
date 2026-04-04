import { Request, Response } from "express";
import { HouseholdService } from "../services/household.service";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new HouseholdService();

export async function listHouseholds(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.list(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch households");
  }
}

export async function createHousehold(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.create(userId, req.body ?? {});
    return ok(res, data, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not create household");
  }
}

export async function getHousehold(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.getById(userId, req.params.id as string);
    if (!data) {
      return fail(res, "NOT_FOUND", "Household not found", 404);
    }

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch household");
  }
}

export async function patchHousehold(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.update(userId, req.params.id as string, req.body ?? {});
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not update household");
  }
}

export async function listHouseholdMembers(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.listMembers(userId, req.params.id as string);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch household members");
  }
}

export async function inviteHouseholdMember(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.inviteMember(userId, req.params.id as string, req.body ?? {});
    return ok(res, data, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not create household invite");
  }
}

export async function acceptHouseholdInvite(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;
    const email = req.auth?.email ?? "";

    const data = await service.acceptInvite(
      userId,
      email,
      req.params.token as string
    );
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not accept household invite");
  }
}

export async function revokeHouseholdInvite(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.revokeInvite(userId, req.params.id as string);
    if (!data) {
      return fail(res, "NOT_FOUND", "Invite not found", 404);
    }

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not revoke household invite");
  }
}

export async function removeHouseholdMember(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.removeMember(
      userId,
      req.params.id as string,
      req.params.memberId as string
    );

    if (!data) {
      return fail(res, "NOT_FOUND", "Member not found", 404);
    }

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not remove household member");
  }
}
