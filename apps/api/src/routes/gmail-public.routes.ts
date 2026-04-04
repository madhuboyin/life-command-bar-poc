import { Router } from "express";
import { handleGmailOAuthCallback } from "../controllers/gmail.controller";

export const gmailPublicRouter = Router();

gmailPublicRouter.get("/callback", handleGmailOAuthCallback);
