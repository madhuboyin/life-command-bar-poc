import { Router } from "express";
import { getDashboardInsights } from "../controllers/dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get("/insights", getDashboardInsights);
