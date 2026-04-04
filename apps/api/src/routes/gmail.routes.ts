import { Router } from "express";
import {
  disconnectGmail,
  getGmailConnectionStatus,
  runGmailSync,
  startGmailOAuth,
  updateGmailPreferences
} from "../controllers/gmail.controller";

export const gmailRouter = Router();

gmailRouter.post("/oauth/start", startGmailOAuth);
gmailRouter.get("/status", getGmailConnectionStatus);
gmailRouter.patch("/preferences", updateGmailPreferences);
gmailRouter.post("/sync", runGmailSync);
gmailRouter.post("/disconnect", disconnectGmail);
