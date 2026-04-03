import cors from "cors";
import express from "express";
import { healthRouter } from "./routes/health.routes";
import { obligationRouter } from "./routes/obligation.routes";
import { todayFeedRouter } from "./routes/today-feed.routes";
import { feedbackRouter } from "./routes/feedback.routes";
import { resolutionRouter } from "./routes/resolution.routes";
import { commandRouter } from "./routes/command.routes";
import { uploadRouter } from "./routes/upload.routes";
import { importRouter } from "./routes/import.routes";
import { reminderRouter } from "./routes/reminder.routes";
import { requireAuth } from "./middleware/auth.middleware";
import { dashboardRouter } from "./routes/dashboard.routes";
import { guidedJourneyRouter } from "./routes/guided-journey.routes";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api", requireAuth);
  app.use("/api/commands", commandRouter);
  app.use("/api/obligations", obligationRouter);
  app.use("/api/today-feed", todayFeedRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/uploads", uploadRouter);
  app.use("/api/imports", importRouter);
  app.use("/api/reminders", reminderRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/guided-journeys", guidedJourneyRouter);
  app.use("/api", resolutionRouter);

  return app;
}
