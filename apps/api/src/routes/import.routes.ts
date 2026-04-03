import { Router } from "express";
import { importEmailForward } from "../controllers/import.controller";

export const importRouter = Router();

importRouter.post("/email-forward", importEmailForward);
