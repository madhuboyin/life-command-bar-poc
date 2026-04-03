import { Router } from "express";
import { getResolution } from "../controllers/resolution.controller";

export const resolutionRouter = Router();

resolutionRouter.get("/obligations/:id/resolution", getResolution);
