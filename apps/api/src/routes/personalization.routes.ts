import { Router } from "express";
import {
  getPersonalizationDebug,
  getPersonalizationSummary
} from "../controllers/personalization.controller";

export const personalizationRouter = Router();

personalizationRouter.get("/summary", getPersonalizationSummary);
personalizationRouter.get("/debug", getPersonalizationDebug);
