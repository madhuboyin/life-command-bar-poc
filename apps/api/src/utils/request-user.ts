import { Request, Response } from "express";
import { fail } from "./api-response";

export function getRequiredUserId(req: Request, res: Response): string | null {
  const userId = req.auth?.userId;

  if (!userId) {
    fail(res, "UNAUTHORIZED", "Authentication required", 401);
    return null;
  }

  return userId;
}
