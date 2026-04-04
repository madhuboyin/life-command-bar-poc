import { Router } from "express";
import {
  acceptHouseholdInvite,
  revokeHouseholdInvite
} from "../controllers/household.controller";

export const householdInviteRouter = Router();

householdInviteRouter.post("/:token/accept", acceptHouseholdInvite);
householdInviteRouter.post("/:id/revoke", revokeHouseholdInvite);
