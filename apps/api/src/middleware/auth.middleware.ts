import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../clients/prisma.client";
import { fail } from "../utils/api-response";

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

function isSafeUserId(value: string) {
  return /^[a-zA-Z0-9._:-]{3,128}$/.test(value);
}

function buildFallbackEmail(userId: string) {
  const hash = crypto.createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return `user-${hash}@local.lcb`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userIdFromHeader = getHeaderValue(req.headers["x-user-id"]);
  const userIdFromBearer = getBearerToken(req);
  const userId = userIdFromHeader || userIdFromBearer;

  if (!userId) {
    return fail(
      res,
      "UNAUTHORIZED",
      "Authentication required. Provide x-user-id or Authorization: Bearer <user-id>.",
      401
    );
  }

  if (!isSafeUserId(userId)) {
    return fail(
      res,
      "VALIDATION_ERROR",
      "Invalid user identity format",
      400,
      {
        hint: "Use 3-128 chars: letters, numbers, '.', '_', ':' or '-'."
      }
    );
  }

  const emailHeader = getHeaderValue(req.headers["x-user-email"]);
  if (emailHeader && !isValidEmail(emailHeader)) {
    return fail(res, "VALIDATION_ERROR", "Invalid x-user-email header", 400);
  }

  try {
    const email = emailHeader || buildFallbackEmail(userId);

    const user = await prisma.user.upsert({
      where: { id: userId },
      update: emailHeader ? { email: emailHeader } : {},
      create: {
        id: userId,
        email
      }
    });

    req.auth = {
      userId: user.id,
      email: user.email
    };

    return next();
  } catch (error) {
    logAuthFailure(error, userId, emailHeader);

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
