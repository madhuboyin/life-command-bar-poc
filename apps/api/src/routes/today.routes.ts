import { Router } from "express";
import { applyTodayItemAction, getTodayView } from "../controllers/today.controller";

export const todayRouter = Router();

todayRouter.get("/", getTodayView);
todayRouter.post("/items/:id/actions", applyTodayItemAction);
