import { Router } from "express";
import { createOutcomeFeedback } from "../controllers/outcome-feedback.controller";

export const outcomeFeedbackRouter = Router();

outcomeFeedbackRouter.post("/", createOutcomeFeedback);
