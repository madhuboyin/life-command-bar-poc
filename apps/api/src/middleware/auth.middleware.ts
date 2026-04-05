import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { fail } from "../utils/api-response";
import { verifyApiAccessToken } from "../utils/api-access-token";

function getHeaderValue(raw: string | string[] | undefined) {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw[0]?.trim() ?? "";
  return "";
}

function getBearerToken(req: Request) {
  const authorization = getHeaderValue(req.headers.authorization);
  if (!authorization) return "";

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isSafeUserId(value: string) {
  return /^[a-zA-Z0-9._:-]{3,128}$/.test(value);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearerToken = getBearerToken(req);
  const secret = resolveApiAuthSecret();
  const devHeaderFallbackEnabled = allowDevHeaderFallback();

  try {
    if (bearerToken && secret) {
      const payload = verifyApiAccessToken(bearerToken, secret);
      if (!payload) {
        return fail(res, "UNAUTHORIZED", "Invalid or expired authentication token", 401);
      }

      const user = await prisma.user.findUnique({
        where: {
          id: payload.sub
        }
      });

      if (!user) {
        return fail(res, "UNAUTHORIZED", "Authenticated user was not found", 401);
      }

      if (user.email.toLowerCase() !== payload.email.toLowerCase()) {
        return fail(res, "UNAUTHORIZED", "Authentication token does not match user", 401);
      }

      req.auth = {
        userId: user.id,
        email: user.email
      };
      return next();
    }

    if (!devHeaderFallbackEnabled) {
      return fail(
        res,
        "UNAUTHORIZED",
        "Authentication required. Provide Authorization: Bearer <token>.",
        401
      );
    }

    const devUserId = getHeaderValue(req.headers["x-user-id"]);
    if (!devUserId) {
      return fail(res, "UNAUTHORIZED", "Authentication required.", 401);
    }
    if (!isSafeUserId(devUserId)) {
      return fail(res, "VALIDATION_ERROR", "Invalid x-user-id format", 400);
    }

    const emailHeader = getHeaderValue(req.headers["x-user-email"]);
    if (emailHeader && !isValidEmail(emailHeader)) {
      return fail(res, "VALIDATION_ERROR", "Invalid x-user-email header", 400);
    }

    const user = await prisma.user.upsert({
      where: { id: devUserId },
      update: emailHeader ? { email: emailHeader } : {},
      create: {
        id: devUserId,
        email: emailHeader || `${devUserId}@dev.local`
      }
    });

    req.auth = {
      userId: user.id,
      email: user.email
    };

    return next();
  } catch (error) {
    logAuthFailure(error, getHeaderValue(req.headers["x-user-id"]), getHeaderValue(req.headers["x-user-email"]));

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail(
        res,
        "CONFLICT",
        "That email is already linked to another user",
        409
      );
    }

    if (isSchemaNotReadyError(error)) {
      return fail(
        res,
        "SERVICE_UNAVAILABLE",
        "Authentication unavailable: database schema is not ready",
        503,
        {
          hint: "Apply Prisma schema migration/db push and retry."
        }
      );
    }

    if (isDatabaseUnavailableError(error)) {
      return fail(
        res,
        "SERVICE_UNAVAILABLE",
        "Authentication unavailable: database is not reachable",
        503
      );
    }

    return fail(res, "INTERNAL_ERROR", "Could not authenticate request", 500, {
      hint: "Check API logs for auth middleware dependency failures."
    });
  }
}

function resolveApiAuthSecret() {
  const direct = (process.env.API_AUTH_TOKEN_SECRET || "").trim();
  if (direct.length >= 32) return direct;
  const shared = (process.env.AUTH_SECRET || "").trim();
  if (shared.length >= 32) return shared;
  return "";
}

function allowDevHeaderFallback() {
  if (process.env.NODE_ENV === "production") return false;
  return (process.env.ALLOW_DEV_USER_HEADER_AUTH || "").toLowerCase() === "true";
}

function isSchemaNotReadyError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return error.code === "P2021" || error.code === "P2022";
}

function isDatabaseUnavailableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return error.code === "P1001" || error.code === "P1008" || error.code === "P1017";
}

function logAuthFailure(error: unknown, userId: string, emailHeader: string) {
  const details: Record<string, unknown> = {
    userId,
    hasEmailHeader: Boolean(emailHeader)
  };

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    details.errorType = "PrismaClientKnownRequestError";
    details.code = error.code;
    details.meta = error.meta ?? null;
    details.message = error.message;
  } else if (error instanceof Prisma.PrismaClientInitializationError) {
    details.errorType = "PrismaClientInitializationError";
    details.errorCode = error.errorCode ?? null;
    details.message = error.message;
  } else if (error instanceof Error) {
    details.errorType = error.name;
    details.message = error.message;
  } else {
    details.errorType = "UnknownError";
    details.raw = error;
  }

  console.error("[auth] Authentication dependency failure", details);
}
