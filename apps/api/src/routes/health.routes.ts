import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    success: true,
    data: {
      ok: true,
      service: "api"
    }
  });
});
