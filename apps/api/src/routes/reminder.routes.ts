import { Router } from "express";
import { createReminder, listReminders } from "../controllers/reminder.controller";

export const reminderRouter = Router();

reminderRouter.get("/", listReminders);
reminderRouter.post("/", createReminder);
