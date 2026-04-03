import { Router } from "express";
import {
  createObligation,
  getObligationById,
  listObligations
} from "../controllers/obligation.controller";
import {
  dismissObligation,
  markObligationDone,
  postponeObligation
} from "../controllers/obligation-actions.controller";

export const obligationRouter = Router();

obligationRouter.get("/", listObligations);
obligationRouter.get("/:id", getObligationById);
obligationRouter.post("/", createObligation);

obligationRouter.post("/:id/mark-done", markObligationDone);
obligationRouter.post("/:id/dismiss", dismissObligation);
obligationRouter.post("/:id/postpone", postponeObligation);
