import { Router } from "express";
import { sampleObligations } from "../services/sample-data.service";

export const obligationRouter = Router();

obligationRouter.get("/", (_req, res) => {
  res.json({ items: sampleObligations });
});
