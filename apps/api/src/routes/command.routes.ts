import { Router } from "express";
import {
  executeCommand,
  ingestCommand,
  parseCommand
} from "../controllers/command.controller";

export const commandRouter = Router();

commandRouter.post("/parse", parseCommand);
commandRouter.post("/execute", executeCommand);
commandRouter.post("/ingest", ingestCommand);
