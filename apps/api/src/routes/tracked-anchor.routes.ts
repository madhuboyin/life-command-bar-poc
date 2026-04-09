import { Router } from "express";
import {
  archiveTrackedAnchor,
  cancelTrackedAnchor,
  createTrackedAnchor,
  getTrackedAnchorById,
  listTrackedAnchors,
  pauseTrackedAnchor,
  snoozeTrackedAnchor,
  updateTrackedAnchor
} from "../controllers/tracked-anchor.controller";

export const trackedAnchorRouter = Router();

trackedAnchorRouter.get("/", listTrackedAnchors);
trackedAnchorRouter.get("/:id", getTrackedAnchorById);
trackedAnchorRouter.post("/", createTrackedAnchor);
trackedAnchorRouter.patch("/:id", updateTrackedAnchor);
trackedAnchorRouter.post("/:id/pause", pauseTrackedAnchor);
trackedAnchorRouter.post("/:id/cancel", cancelTrackedAnchor);
trackedAnchorRouter.post("/:id/archive", archiveTrackedAnchor);
trackedAnchorRouter.post("/:id/snooze", snoozeTrackedAnchor);
