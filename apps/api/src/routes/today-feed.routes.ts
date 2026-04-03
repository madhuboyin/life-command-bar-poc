import { Router } from "express";
import { getTodayFeed } from "../controllers/today-feed.controller";

export const todayFeedRouter = Router();

todayFeedRouter.get("/", getTodayFeed);
