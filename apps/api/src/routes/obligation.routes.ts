import { Router } from "express";
import {
  createOrResumeGuidedJourney,
  getActiveGuidedJourneyForObligation
} from "../controllers/guided-journey.controller";
import {
  correctObligation,
  confirmObligationCandidate,
  createObligation,
  getObligationById,
  getObligationHistory,
  getObligationReviewQueue,
  getObligationSource,
  listObligations,
  rejectObligationCandidate,
  updateObligation
} from "../controllers/obligation.controller";
import {
  dismissObligation,
  markObligationDone,
  postponeObligation
} from "../controllers/obligation-actions.controller";

export const obligationRouter = Router();

obligationRouter.get("/", listObligations);
obligationRouter.get("/review-queue", getObligationReviewQueue);
obligationRouter.get("/:id", getObligationById);
obligationRouter.get("/:id/history", getObligationHistory);
obligationRouter.get("/:id/source", getObligationSource);
obligationRouter.get("/:id/guided-journey", getActiveGuidedJourneyForObligation);
obligationRouter.post("/", createObligation);
obligationRouter.patch("/:id", updateObligation);
obligationRouter.post("/:id/correct", correctObligation);
obligationRouter.patch("/:id/confirm", confirmObligationCandidate);
obligationRouter.patch("/:id/reject", rejectObligationCandidate);
obligationRouter.post("/:id/guided-journey", createOrResumeGuidedJourney);

obligationRouter.post("/:id/mark-done", markObligationDone);
obligationRouter.post("/:id/dismiss", dismissObligation);
obligationRouter.post("/:id/postpone", postponeObligation);
