import { Router } from "express";
import {
  confirmPrediction,
  deletePrediction,
  dismissPrediction,
  getPredictionById,
  listPredictions,
  listUpcomingPredictions,
  patchPrediction,
  rebuildPredictions
} from "../controllers/prediction.controller";

export const predictionRouter = Router();

predictionRouter.get("/", listPredictions);
predictionRouter.get("/upcoming", listUpcomingPredictions);
predictionRouter.get("/:id", getPredictionById);
predictionRouter.post("/rebuild", rebuildPredictions);
predictionRouter.post("/:id/confirm", confirmPrediction);
predictionRouter.post("/:id/dismiss", dismissPrediction);
predictionRouter.patch("/:id", patchPrediction);
predictionRouter.delete("/:id", deletePrediction);
