import { Request, Response } from "express";
import { CommandService } from "../services/command.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new CommandService();

export async function parseCommand(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const parsed = service.parse(req.body);
    return ok(res, parsed);
  } catch (error) {
    return handleControllerError(res, error, "Could not parse command");
  }
}

export async function executeCommand(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const result = await service.execute(userId, req.body);
    return ok(res, result);
  } catch (error) {
    return handleControllerError(res, error, "Could not execute command");
  }
}
