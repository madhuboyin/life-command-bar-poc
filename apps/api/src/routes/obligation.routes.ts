import { Router } from "express";
import {
  createObligation,
  getObligationById,
  listObligations
} from "../controllers/obligation.controller";

export const obligationRouter = Router();

obligationRouter.get("/", listObligations);
obligationRouter.get("/:id", getObligationById);
obligationRouter.post("/", createObligation);
