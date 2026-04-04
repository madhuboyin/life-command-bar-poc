import { Router } from "express";
import {
  getDailyPulse,
  getDailyPulseState,
  trackDailyPulseAction
} from "../controllers/daily-pulse.controller";

export const dailyPulseRouter = Router();

dailyPulseRouter.get("/", getDailyPulse);
dailyPulseRouter.get("/state", getDailyPulseState);
dailyPulseRouter.post("/track-action", trackDailyPulseAction);
