import crypto from "crypto";
import { ExternalAccountStatus, Prisma } from "@prisma/client";
import { AppError } from "../utils/app-error";
import { decryptSecret, encryptSecret } from "../utils/secret-crypto";
import { ExternalAccountRepository } from "../repositories/external-account.repository";

const GMAIL_READONLY_SCOPE = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "openid"
].join(" ");

type OAuthStatePayload = {
  userId: string;
  issuedAt: number;
  windowDays: 30 | 90 | 365;
  autoSyncEnabled: boolean;
  scanSubscriptions: boolean;
  scanBills: boolean;
  scanRenewals: boolean;
  includeRecurringReceipts: boolean;
};

type OAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GmailProfileResponse = {
  emailAddress?: string;
  historyId?: string;
};

export class GmailAuthService {
  private readonly repository = new ExternalAccountRepository();

  async getConnectionStatus(userId: string) {
    const connection = await this.repository.getGmailConnectionForUser(userId);
    if (!connection) return null;

    return {
      id: connection.id,
      provider: connection.provider,
      email: connection.email,
      scope: connection.scope,
      status: connection.status,
      errorCode: connection.errorCode,
      errorMessage: connection.errorMessage,
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      lastHistoryId: connection.lastHistoryId,
      lastProcessedMessageId: connection.lastProcessedMessageId,
      lastProcessedMessageDate: connection.lastProcessedMessageDate?.toISOString() ?? null,
      lastSyncStatus: connection.lastSyncStatus,
      lastSyncWindowDays: connection.lastSyncWindowDays,
      lastSyncMatchedCount: connection.lastSyncMatchedCount,
      lastSyncIngestedCount: connection.lastSyncIngestedCount,
      lastSyncDuplicateCount: connection.lastSyncDuplicateCount,
      lastSyncErrorCount: connection.lastSyncErrorCount,
      autoSyncEnabled: connection.autoSyncEnabled,
      scanSubscriptions: connection.scanSubscriptions,
      scanBills: connection.scanBills,
      scanRenewals: connection.scanRenewals,
      includeRecurringReceipts: connection.includeRecurringReceipts,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString()
    };
  }

  createAuthorizationUrl(input: {
    userId: string;
    windowDays: 30 | 90 | 365;
    autoSyncEnabled: boolean;
    scanSubscriptions: boolean;
    scanBills: boolean;
    scanRenewals: boolean;
    includeRecurringReceipts: boolean;
  }) {
    const config = this.getOAuthConfig();

    const state = this.encodeState({
      userId: input.userId,
      issuedAt: Date.now(),
      windowDays: input.windowDays,
      autoSyncEnabled: input.autoSyncEnabled,
      scanSubscriptions: input.scanSubscriptions,
      scanBills: input.scanBills,
      scanRenewals: input.scanRenewals,
      includeRecurringReceipts: input.includeRecurringReceipts
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: GMAIL_READONLY_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state
    });

    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    };
  }

  async handleOAuthCallback(input: {
    code: string;
    state: string;
  }) {
    const config = this.getOAuthConfig();
    const state = this.decodeState(input.state);

    const tokenResponse = await this.exchangeCodeForTokens({
      code: input.code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri
    });

    if (!tokenResponse.access_token) {
      throw new AppError("INTEGRATION_ERROR", "Google OAuth did not return access token", 502);
    }

    const profile = await this.fetchGmailProfile(tokenResponse.access_token);
    const email = profile.emailAddress?.trim().toLowerCase();
    if (!email) {
      throw new AppError("INTEGRATION_ERROR", "Could not resolve Gmail account email", 502);
    }

    const existing = await this.repository.getGmailConnectionForUser(state.userId, {
      includeTokens: true
    });

    const refreshToken = tokenResponse.refresh_token
      ? tokenResponse.refresh_token
      : decryptSecret(existing?.refreshTokenEncrypted ?? null);

    if (!refreshToken) {
      throw new AppError(
        "INTEGRATION_ERROR",
        "Google OAuth did not return a refresh token",
        502,
        {
          hint: "Disconnect Gmail and reconnect with consent prompt."
        }
      );
    }

    const scope = tokenResponse.scope?.trim() || GMAIL_READONLY_SCOPE;

    const connection = await this.repository.upsertGmailConnection({
      userId: state.userId,
      providerAccountId: email,
      email,
      accessTokenEncrypted: encryptSecret(tokenResponse.access_token),
      refreshTokenEncrypted: encryptSecret(refreshToken),
      scope,
      autoSyncEnabled: state.autoSyncEnabled,
      scanSubscriptions: state.scanSubscriptions,
      scanBills: state.scanBills,
      scanRenewals: state.scanRenewals,
      includeRecurringReceipts: state.includeRecurringReceipts,
      lastHistoryId: profile.historyId ?? null
    });

    await this.repository.createAuditEvent({
      userId: state.userId,
      eventType: "gmail_connection_created",
      metadata: {
        externalConnectionId: connection.id,
        email,
        scope,
        providerAccountId: email
      }
    });
    await this.repository.createAuditEvent({
      userId: state.userId,
      eventType: "gmail_connection_linked_to_user",
      metadata: {
        externalConnectionId: connection.id,
        email
      }
    });

    return {
      userId: state.userId,
      connectionId: connection.id,
      email,
      initialSync: {
        windowDays: state.windowDays,
        autoSyncEnabled: state.autoSyncEnabled,
        scanSubscriptions: state.scanSubscriptions,
        scanBills: state.scanBills,
        scanRenewals: state.scanRenewals,
        includeRecurringReceipts: state.includeRecurringReceipts
      }
    };
  }

  async ensureActiveConnection(userId: string, options?: { includeTokens?: boolean }) {
    const connection = await this.repository.getGmailConnectionForUser(userId, {
      includeTokens: options?.includeTokens ?? false
    });

    if (!connection || connection.status !== ExternalAccountStatus.ACTIVE) {
      throw new AppError("NOT_FOUND", "Gmail is not connected", 404);
    }

    return connection;
  }

  async refreshAccessToken(userId: string) {
    const config = this.getOAuthConfig();
    const connection = await this.ensureActiveConnection(userId, { includeTokens: true });
    const refreshToken = decryptSecret(connection.refreshTokenEncrypted ?? null);

    if (!refreshToken) {
      await this.repository.updateGmailConnection(userId, {
        status: ExternalAccountStatus.ERROR,
        errorCode: "missing_refresh_token",
        errorMessage: "Refresh token is missing. Reconnect Gmail."
      });

      throw new AppError("INTEGRATION_ERROR", "Gmail refresh token is unavailable", 409);
    }

    const tokenResponse = await this.refreshWithGoogle({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken
    });

    if (!tokenResponse.access_token) {
      await this.repository.updateGmailConnection(userId, {
        status: ExternalAccountStatus.ERROR,
        errorCode: tokenResponse.error ?? "token_refresh_failed",
        errorMessage: tokenResponse.error_description ?? "Could not refresh Gmail token"
      });

      throw new AppError("INTEGRATION_ERROR", "Could not refresh Gmail token", 502);
    }

    await this.repository.updateGmailConnection(userId, {
      accessTokenEncrypted: encryptSecret(tokenResponse.access_token),
      refreshTokenEncrypted: tokenResponse.refresh_token
        ? encryptSecret(tokenResponse.refresh_token)
        : connection.refreshTokenEncrypted,
      status: ExternalAccountStatus.ACTIVE,
      errorCode: null,
      errorMessage: null
    });

    return tokenResponse.access_token;
  }

  async getAccessToken(userId: string) {
    const connection = await this.ensureActiveConnection(userId, { includeTokens: true });
    const token = decryptSecret(connection.accessTokenEncrypted ?? null);

    if (!token) {
      return this.refreshAccessToken(userId);
    }

    return token;
  }

  async updatePreferences(
    userId: string,
    input: {
      autoSyncEnabled?: boolean;
      scanSubscriptions?: boolean;
      scanBills?: boolean;
      scanRenewals?: boolean;
      includeRecurringReceipts?: boolean;
    }
  ) {
    await this.ensureActiveConnection(userId);

    const data: Prisma.ExternalAccountConnectionUpdateInput = {};
    if (typeof input.autoSyncEnabled === "boolean") data.autoSyncEnabled = input.autoSyncEnabled;
    if (typeof input.scanSubscriptions === "boolean") data.scanSubscriptions = input.scanSubscriptions;
    if (typeof input.scanBills === "boolean") data.scanBills = input.scanBills;
    if (typeof input.scanRenewals === "boolean") data.scanRenewals = input.scanRenewals;
    if (typeof input.includeRecurringReceipts === "boolean") {
      data.includeRecurringReceipts = input.includeRecurringReceipts;
    }

    if (Object.keys(data).length === 0) {
      return this.getConnectionStatus(userId);
    }

    await this.repository.updateGmailConnection(userId, data);
    return this.getConnectionStatus(userId);
  }

  async disconnect(userId: string) {
    const connection = await this.repository.getGmailConnectionForUser(userId);
    if (!connection) {
      return { disconnected: false };
    }

    await this.repository.disconnectGmailConnection(userId);
    await this.repository.createAuditEvent({
      userId,
      eventType: "gmail_connection_disconnected",
      metadata: {
        externalConnectionId: connection.id,
        email: connection.email
      }
    });

    return { disconnected: true };
  }

  getSuccessRedirectUrl(params: { connected?: string; error?: string; details?: string }) {
    const base =
      process.env.GMAIL_OAUTH_SUCCESS_REDIRECT ||
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000/settings";

    const url = new URL(base);
    if (params.connected) url.searchParams.set("gmail", params.connected);
    if (params.error) url.searchParams.set("gmail_error", params.error);
    if (params.details) url.searchParams.set("gmail_error_details", params.details);
    return url.toString();
  }

  private getOAuthConfig() {
    const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
    const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
    const redirectUri = (process.env.GMAIL_OAUTH_REDIRECT_URI || "").trim();

    if (!clientId || !clientSecret || !redirectUri) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "Google OAuth is not configured",
        503,
        {
          hint: "Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REDIRECT_URI."
        }
      );
    }

    return {
      clientId,
      clientSecret,
      redirectUri
    };
  }

  private encodeState(payload: OAuthStatePayload) {
    const json = JSON.stringify(payload);
    const encoded = Buffer.from(json, "utf8").toString("base64url");
    const signature = this.signState(encoded);
    return `${encoded}.${signature}`;
  }

  private decodeState(state: string): OAuthStatePayload {
    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) {
      throw new AppError("VALIDATION_ERROR", "OAuth state is invalid", 400);
    }

    const expected = this.signState(encoded);
    if (!safeEquals(signature, expected)) {
      throw new AppError("VALIDATION_ERROR", "OAuth state could not be verified", 400);
    }

    const raw = Buffer.from(encoded, "base64url").toString("utf8");
    const payload = JSON.parse(raw) as OAuthStatePayload;

    if (!payload.userId || !payload.issuedAt) {
      throw new AppError("VALIDATION_ERROR", "OAuth state payload is incomplete", 400);
    }

    const ageMs = Date.now() - payload.issuedAt;
    if (ageMs < 0 || ageMs > 15 * 60 * 1000) {
      throw new AppError("VALIDATION_ERROR", "OAuth state has expired", 400);
    }

    return payload;
  }

  private signState(encodedPayload: string) {
    const secret = this.getStateSecret();
    return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  }

  private getStateSecret() {
    const secret =
      (process.env.GMAIL_OAUTH_STATE_SECRET || process.env.TOKEN_ENCRYPTION_KEY || "").trim();

    if (!secret) {
      throw new AppError(
        "SERVICE_UNAVAILABLE",
        "OAuth state secret is not configured",
        503,
        {
          hint: "Set GMAIL_OAUTH_STATE_SECRET (or TOKEN_ENCRYPTION_KEY)."
        }
      );
    }

    return secret;
  }

  private async exchangeCodeForTokens(input: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code"
      })
    });

    const payload = (await response.json()) as OAuthTokenResponse;

    if (!response.ok) {
      throw new AppError(
        "INTEGRATION_ERROR",
        payload.error_description || "Could not exchange Google OAuth code",
        502,
        {
          providerError: payload.error ?? null
        }
      );
    }

    return payload;
  }

  private async refreshWithGoogle(input: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  }) {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
        grant_type: "refresh_token"
      })
    });

    const payload = (await response.json()) as OAuthTokenResponse;

    if (!response.ok) {
      return payload;
    }

    return payload;
  }

  private async fetchGmailProfile(accessToken: string) {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new AppError("INTEGRATION_ERROR", "Could not load Gmail profile", 502);
    }

    return (await response.json()) as GmailProfileResponse;
  }
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
