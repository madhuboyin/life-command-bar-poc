import { Router } from "express";
import {
  createHousehold,
  getHousehold,
  inviteHouseholdMember,
  listHouseholdMembers,
  listHouseholds,
  patchHousehold,
  removeHouseholdMember
} from "../controllers/household.controller";
import { householdObligationRouter } from "./obligation.routes";
import {
  getHouseholdControlTower,
  getHouseholdPulse,
  getHouseholdReady,
  getHouseholdRecent,
  getHouseholdUpcoming
} from "../controllers/household-surface.controller";

export const householdRouter = Router();

householdRouter.get("/", listHouseholds);
householdRouter.post("/", createHousehold);
householdRouter.get("/:id", getHousehold);
householdRouter.patch("/:id", patchHousehold);

householdRouter.get("/:id/members", listHouseholdMembers);
householdRouter.delete("/:id/members/:memberId", removeHouseholdMember);

householdRouter.post("/:id/invites", inviteHouseholdMember);
householdRouter.use("/:householdId/obligations", householdObligationRouter);

householdRouter.get("/:id/pulse", getHouseholdPulse);
householdRouter.get("/:id/control-tower", getHouseholdControlTower);
householdRouter.get("/:id/upcoming", getHouseholdUpcoming);
householdRouter.get("/:id/ready", getHouseholdReady);
householdRouter.get("/:id/recent", getHouseholdRecent);
