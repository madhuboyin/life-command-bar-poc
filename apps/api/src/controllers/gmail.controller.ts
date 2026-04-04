import { Request, Response } from "express";
import { z } from "zod";
import { GmailAuthService } from "../services/gmail-auth.service";
import { GmailSyncService } from "../services/gmail-sync.service";
import { fail, ok } from "../utils/api-response";
import { handleControllerError } from "../utils/handle-controller-error";
import { getRequiredUserId } from "../utils/request-user";

const authService = new GmailAuthService();
const syncService = new GmailSyncService();

const oauthStartSchema = z.object({
  windowDays: z.enum(["30", "90", "365"]).optional(),
  autoSyncEnabled: z.boolean().optional(),
  scanSubscriptions: z.boolean().optional(),
  scanBills: z.boolean().optional(),
  scanRenewals: z.boolean().optional(),
  includeRecurringReceipts: z.boolean().optional()
});

const syncSchema = z.object({
  mode: z.enum(["INITIAL_BACKFILL", "MANUAL_RESYNC", "INCREMENTAL"]).optional(),
  windowDays: z.enum(["30", "90", "365"]).optional(),
  scanSubscriptions: z.boolean().optional(),
  scanBills: z.boolean().optional(),
  scanRenewals: z.boolean().optional(),
  includeRecurringReceipts: z.boolean().optional(),
  maxMessages: z.number().int().min(20).max(500).optional()
});

const updatePreferencesSchema = z.object({
  autoSyncEnabled: z.boolean().optional(),
  scanSubscriptions: z.boolean().optional(),
  scanBills: z.boolean().optional(),
  scanRenewals: z.boolean().optional(),
  includeRecurringReceipts: z.boolean().optional()
});

export async function startGmailOAuth(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const input = oauthStartSchema.parse(req.body ?? {});
    const auth = authService.createAuthorizationUrl({
      userId,
      windowDays: toWindowDays(input.windowDays),
      autoSyncEnabled: input.autoSyncEnabled ?? false,
      scanSubscriptions: input.scanSubscriptions ?? true,
      scanBills: input.scanBills ?? true,
      scanRenewals: input.scanRenewals ?? true,
      includeRecurringReceipts: input.includeRecurringReceipts ?? false
    });

    return ok(res, auth);
  } catch (error) {
    return handleControllerError(res, error, "Could not start Gmail OAuth");
  }
}

export async function handleGmailOAuthCallback(req: Request, res: Response) {
  const oauthError = typeof req.query.error === "string" ? req.query.error : "";
  const oauthErrorDescription =
    typeof req.query.error_description === "string" ? req.query.error_description : "";

  if (oauthError) {
    const redirectUrl = authService.getSuccessRedirectUrl({
      error: "oauth_denied",
      details: oauthErrorDescription || oauthError
    });
    return res.redirect(302, redirectUrl);
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  if (!code || !state) {
    const redirectUrl = authService.getSuccessRedirectUrl({
      error: "missing_code_or_state"
    });
    return res.redirect(302, redirectUrl);
  }

  try {
    const connected = await authService.handleOAuthCallback({ code, state });

    try {
      await syncService.sync({
        userId: connected.userId,
        mode: "INITIAL_BACKFILL",
        windowDays: connected.initialSync.windowDays,
        scanSubscriptions: connected.initialSync.scanSubscriptions,
        scanBills: connected.initialSync.scanBills,
        scanRenewals: connected.initialSync.scanRenewals,
        includeRecurringReceipts: connected.initialSync.includeRecurringReceipts
      });

      const redirectUrl = authService.getSuccessRedirectUrl({
        connected: "connected"
      });
      return res.redirect(302, redirectUrl);
    } catch (syncError) {
      const redirectUrl = authService.getSuccessRedirectUrl({
        connected: "connected_sync_error",
        details: syncError instanceof Error ? syncError.message : "sync_failed"
      });
      return res.redirect(302, redirectUrl);
    }
  } catch (error) {
    const redirectUrl = authService.getSuccessRedirectUrl({
      error: "callback_failed",
      details: error instanceof Error ? error.message : "unknown_error"
    });
    return res.redirect(302, redirectUrl);
  }
}

export async function getGmailConnectionStatus(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const connection = await authService.getConnectionStatus(userId);
    return ok(res, {
      connection
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not load Gmail status");
  }
}

export async function updateGmailPreferences(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const input = updatePreferencesSchema.parse(req.body ?? {});
    const connection = await authService.updatePreferences(userId, input);

    return ok(res, {
      connection
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not update Gmail settings");
  }
}

export async function runGmailSync(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const input = syncSchema.parse(req.body ?? {});
    const connection = await authService.ensureActiveConnection(userId);

    if (connection.lastSyncStatus === "RUNNING") {
      return fail(res, "CONFLICT", "A Gmail sync is already running", 409);
    }

    const sync = await syncService.sync({
      userId,
      mode: input.mode ?? "MANUAL_RESYNC",
      windowDays: input.windowDays ? toWindowDays(input.windowDays) : undefined,
      scanSubscriptions: input.scanSubscriptions,
      scanBills: input.scanBills,
      scanRenewals: input.scanRenewals,
      includeRecurringReceipts: input.includeRecurringReceipts,
      maxMessages: input.maxMessages
    });

    const refreshed = await authService.getConnectionStatus(userId);

    return ok(res, {
      sync,
      connection: refreshed
    });
  } catch (error) {
    return handleControllerError(res, error, "Could not sync Gmail");
  }
}

export async function disconnectGmail(req: Request, res: Response) {
  try {
    const userId = getRequiredUserId(req, res);
    if (!userId) return;

    const result = await authService.disconnect(userId);
    return ok(res, result);
  } catch (error) {
    return handleControllerError(res, error, "Could not disconnect Gmail");
  }
}

function toWindowDays(value?: "30" | "90" | "365") {
  if (value === "90") return 90;
  if (value === "365") return 365;
  return 30;
}
