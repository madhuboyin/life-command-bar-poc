import { Response } from "express";
import { ZodError } from "zod";
import { fail } from "./api-response";
import { AppError } from "./app-error";

export function handleControllerError(
  res: Response,
  error: unknown,
  fallbackMessage = "Unexpected server error"
) {
  if (error instanceof ZodError) {
    return fail(res, "VALIDATION_ERROR", "Input is invalid", 400, {
      issues: error.issues
    });
  }

  if (error instanceof AppError) {
    return fail(res, error.code, error.message, error.status, error.details);
  }

  console.error(error);
  return fail(res, "INTERNAL_ERROR", fallbackMessage, 500);
}
