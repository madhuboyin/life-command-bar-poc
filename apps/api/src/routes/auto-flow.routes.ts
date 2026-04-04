import { Router } from "express";
import {
  acceptAutoFlow,
  dismissAutoFlow,
  listAutoFlow,
  triggerAutoFlow
} from "../controllers/auto-flow.controller";

export const autoFlowRouter = Router();

autoFlowRouter.get("/", listAutoFlow);
autoFlowRouter.post("/trigger", triggerAutoFlow);
autoFlowRouter.post("/:id/accept", acceptAutoFlow);
autoFlowRouter.post("/:id/dismiss", dismissAutoFlow);
