import { Request, Response } from "express";
import { AlertService } from "../observability/alert.service";
import { EventService } from "../observability/event.service";
import { MetricsService } from "../observability/metrics.service";
import { ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";

const metricsService = new MetricsService();
const eventService = new EventService();
const alertService = new AlertService();

export async function getAdminMetrics(req: Request, res: Response) {
  try {
    const filters = {
      userId: readString(req.query.userId),
      householdId: readString(req.query.householdId)
    };

    const data = await metricsService.getMetricsOverview(filters);
    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load admin metrics");
  }
}

export async function getAdminMetricByType(req: Request, res: Response) {
  try {
    const metricType = String(req.params.type || "").trim();
    const timeBucket = parseTimeBucket(req.query.timeBucket);

    const data = await metricsService.getMetricByType({
      metricType,
      timeBucket,
      limit: parseIntQuery(req.query.limit, 60, 1, 365),
      userId: readString(req.query.userId),
      householdId: readString(req.query.householdId)
    });

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load metric");
  }
}

export async function getAdminMetricTrends(req: Request, res: Response) {
  try {
    const metricTypes = readString(req.query.metricTypes)
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const data = await metricsService.getTrends({
      metricTypes,
      timeBucket: parseTimeBucket(req.query.timeBucket),
      limit: parseIntQuery(req.query.limit, 30, 1, 180),
      userId: readString(req.query.userId),
      householdId: readString(req.query.householdId)
    });

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load metric trends");
  }
}

export async function getAdminEvents(req: Request, res: Response) {
  try {
    const data = await eventService.list({
      userId: readString(req.query.userId),
      householdId: readString(req.query.householdId),
      eventType: readString(req.query.eventType),
      entityType: readString(req.query.entityType),
      entityId: readString(req.query.entityId),
      traceId: readString(req.query.traceId),
      correlationId: readString(req.query.correlationId),
      start: parseDateQuery(req.query.start),
      end: parseDateQuery(req.query.end),
      limit: parseIntQuery(req.query.limit, 100, 1, 500),
      offset: parseIntQuery(req.query.offset, 0, 0, 50000)
    });

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load observability events");
  }
}

export async function getAdminAlerts(req: Request, res: Response) {
  try {
    const data = await alertService.getAlerts({
      userId: readString(req.query.userId),
      householdId: readString(req.query.householdId)
    });

    return ok(res, data);
  } catch (error) {
    return handleControllerError(res, error, "Could not load alerts");
  }
}

function readString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseDateQuery(value: unknown) {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function parseIntQuery(value: unknown, fallback: number, minValue: number, maxValue: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < minValue) return minValue;
  if (rounded > maxValue) return maxValue;
  return rounded;
}

function parseTimeBucket(value: unknown): "DAY" | "WEEK" | "MONTH" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === "DAY" || normalized === "WEEK" || normalized === "MONTH") {
    return normalized;
  }
  return undefined;
}
