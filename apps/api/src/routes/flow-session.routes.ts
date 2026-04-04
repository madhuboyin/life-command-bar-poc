import { Router } from "express";
import {
  abandonFlowSession,
  completeFlowSessionStep,
  createOrResumeFlowSession,
  getFlowSessionById,
  moveFlowSessionNext
} from "../controllers/flow-session.controller";

export const flowSessionRouter = Router();

flowSessionRouter.post("/", createOrResumeFlowSession);
flowSessionRouter.get("/:id", getFlowSessionById);
flowSessionRouter.post("/:id/complete-step", completeFlowSessionStep);
flowSessionRouter.post("/:id/next", moveFlowSessionNext);
flowSessionRouter.post("/:id/abandon", abandonFlowSession);
