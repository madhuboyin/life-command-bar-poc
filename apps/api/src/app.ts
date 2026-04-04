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
import { dailyPulseRouter } from "./routes/daily-pulse.routes";
import { outcomeFeedbackRouter } from "./routes/outcome-feedback.routes";
import { personalizationRouter } from "./routes/personalization.routes";
import { flowSessionRouter } from "./routes/flow-session.routes";
import { autoFlowRouter } from "./routes/auto-flow.routes";
import { focusModeRouter } from "./routes/focus-mode.routes";
import { memoryRouter } from "./routes/memory.routes";
import { predictionRouter } from "./routes/prediction.routes";
import { controlTowerRouter } from "./routes/control-tower.routes";
import { zeroInputRouter } from "./routes/zero-input.routes";
import { householdRouter } from "./routes/household.routes";
import { householdInviteRouter } from "./routes/household-invite.routes";
import { adminObservabilityRouter } from "./routes/admin-observability.routes";
import { requireAdmin } from "./middleware/admin.middleware";
import { gmailRouter } from "./routes/gmail.routes";
import { gmailPublicRouter } from "./routes/gmail-public.routes";
import { subscriptionRouter } from "./routes/subscription.routes";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/gmail/oauth", gmailPublicRouter);
  app.use("/api", requireAuth);
  app.use("/api/commands", commandRouter);
  app.use("/api/obligations", obligationRouter);
  app.use("/api/today-feed", todayFeedRouter);
  app.use("/api/feedback", feedbackRouter);
  app.use("/api/uploads", uploadRouter);
  app.use("/api/imports", importRouter);
  app.use("/api/reminders", reminderRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/daily-pulse", dailyPulseRouter);
  app.use("/api/flow-sessions", flowSessionRouter);
  app.use("/api/focus-sessions", focusModeRouter);
  app.use("/api/auto-flow", autoFlowRouter);
  app.use("/api/guided-journeys", guidedJourneyRouter);
  app.use("/api/outcome-feedback", outcomeFeedbackRouter);
  app.use("/api/personalization", personalizationRouter);
  app.use("/api/memory", memoryRouter);
  app.use("/api/predictions", predictionRouter);
  app.use("/api/control-tower", controlTowerRouter);
  app.use("/api/zero-input", zeroInputRouter);
  app.use("/api/households", householdRouter);
  app.use("/api/household-invites", householdInviteRouter);
  app.use("/api/gmail", gmailRouter);
  app.use("/api/subscriptions", subscriptionRouter);
  app.use("/api/admin", requireAdmin, adminObservabilityRouter);
  app.use("/api", resolutionRouter);

  return app;
}
