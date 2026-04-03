import { Router } from "express";
import {
  createObligation,
  getObligationById,
  getObligationHistory,
  listObligations,
  updateObligation
} from "../controllers/obligation.controller";
import {
  dismissObligation,
  markObligationDone,
  postponeObligation
} from "../controllers/obligation-actions.controller";

export const obligationRouter = Router();

obligationRouter.get("/", listObligations);
obligationRouter.get("/:id", getObligationById);
obligationRouter.get("/:id/history", getObligationHistory);
obligationRouter.post("/", createObligation);
obligationRouter.patch("/:id", updateObligation);

obligationRouter.post("/:id/mark-done", markObligationDone);
obligationRouter.post("/:id/dismiss", dismissObligation);
obligationRouter.post("/:id/postpone", postponeObligation);
