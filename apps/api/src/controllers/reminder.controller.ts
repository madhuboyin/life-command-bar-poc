import { Request, Response } from "express";
import { ReminderService } from "../services/reminder.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const service = new ReminderService();

export async function createReminder(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const reminder = await service.create({
      ...req.body,
      userId
    });

    return ok(res, { reminder }, 201);
  } catch (error) {
    return handleControllerError(res, error, "Could not create reminder");
  }
}

export async function listReminders(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const data = await service.list(userId);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not fetch reminders");
  }
}
