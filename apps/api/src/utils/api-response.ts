import { Response } from "express";
import { hardenUserFacingResponseData } from "./user-facing-copy";

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({
    success: true,
    data: hardenUserFacingResponseData(data)
  });
}

export function fail(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: Record<string, unknown>
) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message: hardenUserFacingResponseData(message),
      details: details ?? {}
    }
  });
}
