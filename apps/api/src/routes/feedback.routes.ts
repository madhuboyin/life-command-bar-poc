import { Router } from "express";
import { createFeedback } from "../controllers/feedback.controller";

export const feedbackRouter = Router();

feedbackRouter.post("/", createFeedback);
