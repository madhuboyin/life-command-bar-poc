import { Router } from "express";
import {
  completeDailyPulseItem,
  dismissDailyPulseItem,
  getDailyPulse,
  getDailyPulseProgress,
  getDailyPulseState,
  openDailyPulse,
  openGuidedDailyPulseItem,
  postponeDailyPulseItem,
  trackDailyPulseAction
} from "../controllers/daily-pulse.controller";

export const dailyPulseRouter = Router();

dailyPulseRouter.get("/", getDailyPulse);
dailyPulseRouter.get("/state", getDailyPulseState);
dailyPulseRouter.get("/progress", getDailyPulseProgress);
dailyPulseRouter.post("/open", openDailyPulse);
dailyPulseRouter.post("/items/:obligationId/complete", completeDailyPulseItem);
dailyPulseRouter.post("/items/:obligationId/postpone", postponeDailyPulseItem);
dailyPulseRouter.post("/items/:obligationId/dismiss", dismissDailyPulseItem);
dailyPulseRouter.post("/items/:obligationId/open-guided", openGuidedDailyPulseItem);
dailyPulseRouter.post("/track-action", trackDailyPulseAction);
