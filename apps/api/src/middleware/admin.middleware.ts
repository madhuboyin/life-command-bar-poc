import { NextFunction, Request, Response } from "express";
import { fail } from "../utils/api-response";

function parseCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getHeaderValue(raw: string | string[] | undefined) {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw[0]?.trim() ?? "";
  return "";
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = req.auth?.userId;
  if (!userId) {
    return fail(res, "UNAUTHORIZED", "Authentication required", 401);
  }

  const configuredAdminIds = parseCsv(process.env.ADMIN_USER_IDS);
  const configuredApiKey = (process.env.ADMIN_API_KEY || "").trim();
  const requestApiKey = getHeaderValue(req.headers["x-admin-key"]);

  const apiKeyAuthorized = Boolean(configuredApiKey) && configuredApiKey === requestApiKey;
  const userIdAuthorized = configuredAdminIds.includes(userId);

  if (apiKeyAuthorized || userIdAuthorized) {
    return next();
  }

  if (process.env.NODE_ENV !== "production" && configuredAdminIds.length === 0 && !configuredApiKey) {
    return next();
  }

  return fail(res, "FORBIDDEN", "Admin access required", 403, {
    hint: "Set ADMIN_USER_IDS or provide x-admin-key"
  });
}
