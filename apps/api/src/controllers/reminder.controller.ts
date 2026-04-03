import { Request, Response } from "express";
import { ZodError } from "zod";
import { ReminderService } from "../services/reminder.service";
import { fail, ok } from "../utils/api-response";

const service = new ReminderService();
const DEFAULT_USER_ID = "usr_demo_001";

export async function createReminder(req: Request, res: Response) {
  try {
    const reminder = await service.create({
      ...req.body,
      userId: DEFAULT_USER_ID
    });

    return ok(res, { reminder }, 201);
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(res, "VALIDATION_ERROR", "Input is invalid", 400, {
        issues: error.issues
      });
    }

    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not create reminder", 500);
  }
}

export async function listReminders(_req: Request, res: Response) {
  try {
    const data = await service.list(DEFAULT_USER_ID);
    return ok(res, data);
  } catch (error) {
    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not fetch reminders", 500);
  }
}
