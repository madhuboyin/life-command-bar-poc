import { Router } from "express";
import {
  abandonFocusSession,
  completeFocusSession,
  completeFocusSessionItem,
  createFocusSession,
  dismissFocusSessionItem,
  getActiveFocusSession,
  getFocusSessionById,
  nextFocusSessionItem,
  postponeFocusSessionItem,
  skipFocusSessionItem,
  startFocusSession
} from "../controllers/focus-mode.controller";

export const focusModeRouter = Router();

focusModeRouter.post("/", createFocusSession);
focusModeRouter.get("/active", getActiveFocusSession);
focusModeRouter.get("/:id", getFocusSessionById);
focusModeRouter.post("/:id/start", startFocusSession);
focusModeRouter.post("/:id/items/:obligationId/complete", completeFocusSessionItem);
focusModeRouter.post("/:id/items/:obligationId/postpone", postponeFocusSessionItem);
focusModeRouter.post("/:id/items/:obligationId/dismiss", dismissFocusSessionItem);
focusModeRouter.post("/:id/items/:obligationId/skip", skipFocusSessionItem);
focusModeRouter.post("/:id/next", nextFocusSessionItem);
focusModeRouter.post("/:id/complete", completeFocusSession);
focusModeRouter.post("/:id/abandon", abandonFocusSession);
