import { Router } from "express";
import {
  deleteMemoryPattern,
  getMemoryContext,
  getMemorySummary,
  listMemoryEntities,
  listMemoryPatterns,
  rebuildMemory,
  updateMemoryPattern
} from "../controllers/memory.controller";

export const memoryRouter = Router();

memoryRouter.get("/entities", listMemoryEntities);
memoryRouter.get("/patterns", listMemoryPatterns);
memoryRouter.get("/context", getMemoryContext);
memoryRouter.get("/summary", getMemorySummary);
memoryRouter.post("/rebuild", rebuildMemory);
memoryRouter.patch("/pattern/:id", updateMemoryPattern);
memoryRouter.delete("/pattern/:id", deleteMemoryPattern);
