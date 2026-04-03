import cors from "cors";
import express from "express";
import { healthRouter } from "./routes/health.routes";
import { obligationRouter } from "./routes/obligation.routes";
import { todayFeedRouter } from "./routes/today-feed.routes";
import { feedbackRouter } from "./routes/feedback.routes";
import { resolutionRouter } from "./routes/resolution.routes";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/obligations", obligationRouter);
  app.use("/api/today-feed", todayFeedRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api", resolutionRouter);

  return app;
}
