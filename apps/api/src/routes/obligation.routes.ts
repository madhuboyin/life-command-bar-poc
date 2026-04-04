import { Router } from "express";
import {
  createOrResumeGuidedJourney,
  getActiveGuidedJourneyForObligation
} from "../controllers/guided-journey.controller";
import {
  assignObligation,
  claimObligation,
  correctObligation,
  confirmObligationCandidate,
  createHouseholdObligation,
  createObligation,
  getObligationById,
  getObligationHistory,
  getObligationReviewQueue,
  getObligationSource,
  handOffObligation,
  listHouseholdObligations,
  listObligations,
  patchObligationScope,
  rejectObligationCandidate,
  unassignObligation,
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
obligationRouter.patch("/:id/assign", assignObligation);
obligationRouter.patch("/:id/unassign", unassignObligation);
obligationRouter.patch("/:id/scope", patchObligationScope);
obligationRouter.post("/:id/claim", claimObligation);
obligationRouter.post("/:id/hand-off", handOffObligation);

obligationRouter.post("/:id/mark-done", markObligationDone);
obligationRouter.post("/:id/dismiss", dismissObligation);
obligationRouter.post("/:id/postpone", postponeObligation);

export const householdObligationRouter = Router({ mergeParams: true });
householdObligationRouter.get("/", listHouseholdObligations);
householdObligationRouter.post("/", createHouseholdObligation);
