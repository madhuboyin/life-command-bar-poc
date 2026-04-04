import { Router } from "express";
import {
  getAdminAlerts,
  getAdminEvents,
  getAdminMetricByType,
  getAdminMetrics,
  getAdminMetricTrends
} from "../controllers/admin-observability.controller";

export const adminObservabilityRouter = Router();

adminObservabilityRouter.get("/metrics", getAdminMetrics);
adminObservabilityRouter.get("/metrics/trends", getAdminMetricTrends);
adminObservabilityRouter.get("/metrics/:type", getAdminMetricByType);
adminObservabilityRouter.get("/events", getAdminEvents);
adminObservabilityRouter.get("/alerts", getAdminAlerts);
