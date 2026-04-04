import { Router } from "express";
import {
  approveZeroInputDecision,
  getZeroInputPolicy,
  listZeroInputApprovals,
  listZeroInputDecisions,
  patchZeroInputPolicy,
  rejectZeroInputDecision,
  undoZeroInputDecision
} from "../controllers/zero-input.controller";

export const zeroInputRouter = Router();

zeroInputRouter.get("/policy", getZeroInputPolicy);
zeroInputRouter.patch("/policy", patchZeroInputPolicy);
zeroInputRouter.get("/decisions", listZeroInputDecisions);
zeroInputRouter.get("/approvals", listZeroInputApprovals);
zeroInputRouter.post("/approvals/:id/approve", approveZeroInputDecision);
zeroInputRouter.post("/approvals/:id/reject", rejectZeroInputDecision);
zeroInputRouter.post("/decisions/:id/undo", undoZeroInputDecision);
