import { Router } from "express";
import {
  abandonGuidedJourney,
  advanceGuidedJourney,
  backGuidedJourney,
  completeGuidedJourney,
  dismissGuidedJourney,
  getGuidedJourneyById,
  selectGuidedJourneyOption
} from "../controllers/guided-journey.controller";

export const guidedJourneyRouter = Router();

guidedJourneyRouter.get("/:id", getGuidedJourneyById);
guidedJourneyRouter.post("/:id/select", selectGuidedJourneyOption);
guidedJourneyRouter.post("/:id/advance", advanceGuidedJourney);
guidedJourneyRouter.post("/:id/back", backGuidedJourney);
guidedJourneyRouter.post("/:id/complete", completeGuidedJourney);
guidedJourneyRouter.post("/:id/abandon", abandonGuidedJourney);
guidedJourneyRouter.post("/:id/dismiss", dismissGuidedJourney);
