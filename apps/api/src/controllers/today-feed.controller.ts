import { Request, Response } from "express";
import { TodayFeedService } from "../services/today-feed.service";
import { fail, ok } from "../utils/api-response";

const service = new TodayFeedService();

// POC hardcoded user until auth exists
const DEFAULT_USER_ID = "usr_demo_001";

export async function getTodayFeed(_req: Request, res: Response) {
  try {
    const data = await service.getTodayFeed(DEFAULT_USER_ID);
    return ok(res, data);
  } catch (error) {
    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not build today feed", 500);
  }
}
