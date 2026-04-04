import { Router } from "express";
import {
  getControlTower,
  getControlTowerApprovals,
  getControlTowerReady,
  getControlTowerRecent,
  getControlTowerReview,
  getControlTowerSystemDecisions,
  getControlTowerUpcoming
} from "../controllers/control-tower.controller";

export const controlTowerRouter = Router();

controlTowerRouter.get("/", getControlTower);
controlTowerRouter.get("/review", getControlTowerReview);
controlTowerRouter.get("/approvals", getControlTowerApprovals);
controlTowerRouter.get("/ready", getControlTowerReady);
controlTowerRouter.get("/upcoming", getControlTowerUpcoming);
controlTowerRouter.get("/recent", getControlTowerRecent);
controlTowerRouter.get("/system-decisions", getControlTowerSystemDecisions);
