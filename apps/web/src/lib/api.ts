import type {
  CommandExecuteResponse,
  CommandParseResponse,
  DailyPulseResponse,
  DailyPulseState,
  DashboardInsightsResponse,
  GuidedJourney,
  Obligation,
  ObligationHistory,
  ObligationSort,
  ObligationView,
  Reminder,
  ResolutionResponse,
  SortDirection,
  TodayFeedResponse
} from "./types";

const PUBLIC_API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
const SERVER_API_BASE_URL = (process.env.API_BASE_URL || "").trim();
const SERVER_APP_URL =
  (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.SITE_URL || "").trim();
const VERCEL_URL = (process.env.VERCEL_URL || "").trim();

const DEFAULT_USER_ID =
  process.env.NEXT_PUBLIC_LCB_USER_ID ||
  process.env.NEXT_PUBLIC_USER_ID ||
  "usr_demo_001";

const DEFAULT_USER_EMAIL =
  process.env.NEXT_PUBLIC_LCB_USER_EMAIL || process.env.NEXT_PUBLIC_USER_EMAIL || "";

type AuthIdentity = {
  userId: string;
  email?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string };
  message?: string;
};

type ObligationsListResponse = {
  items: Obligation[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  appliedView?: ObligationView | null;
};

type ObligationResponse = {
  obligation: Obligation;
};

type RemindersListResponse = {
  items: Reminder[];
};

type ReminderResponse = {
  reminder: Reminder;
};

type GuidedJourneyResponse = {
  journey: GuidedJourney;
};

type GuidedJourneyCreateResponse = {
  journey: GuidedJourney;
  resumed: boolean;
};

type GuidedJourneyMaybeResponse = {
  journey: GuidedJourney | null;
};

type DailyPulseApiResponse = DailyPulseResponse;
type DailyPulseStateApiResponse = DailyPulseState;

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isLocalhostName(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function inferApiOriginFromHostname(hostname: string, protocol: string) {
  if (hostname.startsWith("lcb.")) {
    return `${protocol}//api-${hostname}`;
  }

  if (hostname.startsWith("www.")) {
    return `${protocol}//api.${hostname.slice(4)}`;
  }

  return "";
}

function inferBrowserApiBaseUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname, origin } = window.location;

  if (isLocalhostName(hostname)) {
    return "http://localhost:4000/api";
  }

  const inferredOrigin = inferApiOriginFromHostname(hostname, protocol);
  if (inferredOrigin) {
    return `${inferredOrigin}/api`;
  }

  return `${origin}/api`;
}

function resolveServerOrigin() {
  if (SERVER_APP_URL) {
    if (isAbsoluteHttpUrl(SERVER_APP_URL)) {
      return stripTrailingSlash(SERVER_APP_URL);
    }
    return stripTrailingSlash(`https://${SERVER_APP_URL}`);
  }

  if (VERCEL_URL) {
    return stripTrailingSlash(`https://${VERCEL_URL}`);
  }

  return "";
}

function resolveApiBaseUrl() {
  const isServer = typeof window === "undefined";
  const hasExplicitPublicBaseUrl = Boolean(PUBLIC_API_BASE_URL);

  if (isServer && SERVER_API_BASE_URL) {
    if (isAbsoluteHttpUrl(SERVER_API_BASE_URL)) {
      return stripTrailingSlash(SERVER_API_BASE_URL);
    }

    if (SERVER_API_BASE_URL.startsWith("/")) {
      const serverOrigin = resolveServerOrigin();
      if (serverOrigin) {
        return stripTrailingSlash(new URL(SERVER_API_BASE_URL, serverOrigin).toString());
      }
    }
  }

  if (!isServer) {
    const browserOriginApiBase = stripTrailingSlash(`${window.location.origin}/api`);
    const browserHostIsLocal = isLocalhostName(window.location.hostname);

    // In non-local browser environments, never allow localhost API targets.
    // This prevents stale production bundles/env from routing refresh calls to localhost.
    if (!browserHostIsLocal) {
      if (!PUBLIC_API_BASE_URL) {
        return browserOriginApiBase;
      }

      if (PUBLIC_API_BASE_URL.startsWith("/")) {
        return stripTrailingSlash(PUBLIC_API_BASE_URL);
      }

      if (isAbsoluteHttpUrl(PUBLIC_API_BASE_URL)) {
        try {
          const configuredUrl = new URL(PUBLIC_API_BASE_URL);
          if (isLocalhostName(configuredUrl.hostname)) {
            return browserOriginApiBase;
          }
        } catch {
          return browserOriginApiBase;
        }
      }
    }
  }

  const fallbackBaseUrl = process.env.NODE_ENV === "development" ? "http://localhost:4000/api" : "";
  const rawBaseUrl = PUBLIC_API_BASE_URL || fallbackBaseUrl;

  if (rawBaseUrl && isAbsoluteHttpUrl(rawBaseUrl)) {
    // Safety guard: if a stale production client bundle points to localhost,
    // route browser traffic to an inferred public API host.
    if (!isServer) {
      try {
        const configuredUrl = new URL(rawBaseUrl);
        if (
          isLocalhostName(configuredUrl.hostname) &&
          !isLocalhostName(window.location.hostname)
        ) {
          return stripTrailingSlash(inferBrowserApiBaseUrl());
        }
      } catch {
        // Fall through to regular handling.
      }
    }

    return stripTrailingSlash(rawBaseUrl);
  }

  if (rawBaseUrl && !rawBaseUrl.startsWith("/")) {
    return stripTrailingSlash(rawBaseUrl);
  }

  if (!isServer && rawBaseUrl.startsWith("/")) {
    if (!hasExplicitPublicBaseUrl && process.env.NODE_ENV === "production") {
      return stripTrailingSlash(inferBrowserApiBaseUrl());
    }

    return stripTrailingSlash(rawBaseUrl);
  }

  if (isServer && rawBaseUrl.startsWith("/")) {
    const serverOrigin = resolveServerOrigin();
    if (serverOrigin) {
      return stripTrailingSlash(new URL(rawBaseUrl, serverOrigin).toString());
    }
  }

  if (!isServer) {
    return stripTrailingSlash(inferBrowserApiBaseUrl());
  }

  const serverOrigin = resolveServerOrigin();
  if (serverOrigin) {
    const parsed = new URL(serverOrigin);
    const inferredApiOrigin = inferApiOriginFromHostname(parsed.hostname, parsed.protocol);
    if (inferredApiOrigin) {
      return stripTrailingSlash(`${inferredApiOrigin}/api`);
    }

    return stripTrailingSlash(`${serverOrigin}/api`);
  }

  const serverFallbackPath = rawBaseUrl && rawBaseUrl.startsWith("/") ? rawBaseUrl : "/api";
  return stripTrailingSlash(`http://localhost:4000${serverFallbackPath}`);
}

function getClientStoredIdentity() {
  if (typeof window === "undefined") {
    return {};
  }

  const userId =
    window.localStorage.getItem("lcb.userId") ??
    window.localStorage.getItem("lcb_user_id") ??
    "";

  const email =
    window.localStorage.getItem("lcb.userEmail") ??
    window.localStorage.getItem("lcb_user_email") ??
    "";

  return { userId, email };
}

function resolveAuthIdentity(): AuthIdentity {
  const clientIdentity = getClientStoredIdentity();
  const userId = clientIdentity.userId || DEFAULT_USER_ID;
  const email = clientIdentity.email || DEFAULT_USER_EMAIL || undefined;

  return { userId, email };
}

function withAuthHeaders(init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const auth = resolveAuthIdentity();

  headers.set("x-user-id", auth.userId);
  if (auth.email) {
    headers.set("x-user-email", auth.email);
  }

  return {
    ...init,
    headers
  };
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const baseUrl = resolveApiBaseUrl();
  return fetch(`${baseUrl}${path}`, withAuthHeaders(init));
}

async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  let payload: ApiEnvelope<T> | null = null;

  if (contentType.includes("application/json")) {
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
  }

  if (!res.ok || payload?.success === false) {
    const errorMessage =
      payload?.error?.message ||
      payload?.message ||
      `Request failed with status ${res.status}`;
    throw new Error(errorMessage);
  }

  if (payload && "data" in payload) {
    return payload.data as T;
  }

  return payload as T;
}

export async function getTodayFeed(): Promise<TodayFeedResponse> {
  const res = await apiFetch("/today-feed", {
    cache: "no-store"
  });

  return handleResponse<TodayFeedResponse>(res);
}

export async function getDashboardInsights(): Promise<DashboardInsightsResponse> {
  const res = await apiFetch("/dashboard/insights", {
    cache: "no-store"
  });

  return handleResponse<DashboardInsightsResponse>(res);
}

export async function getObligations(params?: {
  status?: Obligation["status"];
  type?: Obligation["type"];
  view?: ObligationView;
  sort?: ObligationSort;
  direction?: SortDirection;
  limit?: number;
  offset?: number;
}): Promise<ObligationsListResponse> {
  const query = new URLSearchParams();

  if (params?.status) query.set("status", params.status);
  if (params?.type) query.set("type", params.type);
  if (params?.view) query.set("view", params.view);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.direction) query.set("direction", params.direction);
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  if (typeof params?.offset === "number") query.set("offset", String(params.offset));

  const suffix = query.toString() ? `?${query.toString()}` : "";

  const res = await apiFetch(`/obligations${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<ObligationsListResponse>(res);
}

export async function getObligationById(obligationId: string): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}`, {
    cache: "no-store"
  });

  return handleResponse<ObligationResponse>(res);
}

export async function getObligationHistory(obligationId: string): Promise<ObligationHistory> {
  const res = await apiFetch(`/obligations/${obligationId}/history`, {
    cache: "no-store"
  });

  return handleResponse<ObligationHistory>(res);
}

export async function updateObligation(
  obligationId: string,
  input: Record<string, unknown>
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ObligationResponse>(res);
}

export async function getResolution(obligationId: string): Promise<ResolutionResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/resolution`, {
    cache: "no-store"
  });

  return handleResponse<ResolutionResponse>(res);
}

export async function getReminders(): Promise<RemindersListResponse> {
  const res = await apiFetch("/reminders", {
    cache: "no-store"
  });

  return handleResponse<RemindersListResponse>(res);
}

export async function markObligationDone(
  obligationId: string,
  note?: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/mark-done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function dismissObligation(
  obligationId: string,
  reason?: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function postponeObligation(
  obligationId: string,
  until?: string,
  reason?: string
): Promise<ObligationResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/postpone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ until, reason })
  });

  return handleResponse<ObligationResponse>(res);
}

export async function createFeedback(input: {
  obligationId?: string;
  feedItemId?: string;
  type:
    | "ACCEPTED"
    | "IGNORED"
    | "MODIFIED"
    | "COMPLETED"
    | "POSTPONED"
    | "REJECTED"
    | "NOT_RELEVANT"
    | "WRONG_INFO"
    | "DONT_SHOW_AGAIN";
  note?: string;
}): Promise<unknown> {
  const res = await apiFetch("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<unknown>(res);
}

export async function createObligation(input: {
  type: "BILL" | "SUBSCRIPTION" | "RENEWAL" | "COMMITMENT";
  title: string;
  description?: string;
  vendor?: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  recurrence?: string;
  source?: "MANUAL" | "EMAIL" | "DOCUMENT" | "INFERRED";
  confidenceScore?: number;
  urgencyScore?: number;
  importanceScore?: number;
  effortLevel?: "LOW" | "MEDIUM" | "HIGH";
  impactLevel?: "LOW" | "MEDIUM" | "HIGH";
  status?: "DRAFT" | "ACTIVE" | "POSTPONED" | "RESOLVED" | "IGNORED";
}): Promise<ObligationResponse> {
  const res = await apiFetch("/obligations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ObligationResponse>(res);
}

export async function createReminder(input: {
  obligationId?: string;
  title: string;
  scheduledFor: string;
}): Promise<ReminderResponse> {
  const res = await apiFetch("/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<ReminderResponse>(res);
}

export async function uploadFile(file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/uploads", {
    method: "POST",
    body: formData
  });

  return handleResponse<unknown>(res);
}

export async function importEmailForward(input: {
  subject: string;
  from: string;
  bodyText: string;
}): Promise<unknown> {
  const res = await apiFetch("/imports/email-forward", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<unknown>(res);
}

export async function parseCommand(input: {
  input: string;
  context?: { obligationId?: string };
}): Promise<CommandParseResponse> {
  const res = await apiFetch("/commands/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<CommandParseResponse>(res);
}

export async function executeCommand(input: {
  input: string;
  context?: { obligationId?: string };
}): Promise<CommandExecuteResponse> {
  const res = await apiFetch("/commands/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse<CommandExecuteResponse>(res);
}

export async function createOrResumeGuidedJourney(
  obligationId: string
): Promise<GuidedJourneyCreateResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/guided-journey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyCreateResponse>(res);
}

export async function getActiveGuidedJourneyForObligation(
  obligationId: string
): Promise<GuidedJourneyMaybeResponse> {
  const res = await apiFetch(`/obligations/${obligationId}/guided-journey`, {
    cache: "no-store"
  });

  return handleResponse<GuidedJourneyMaybeResponse>(res);
}

export async function getGuidedJourneyById(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}`, {
    cache: "no-store"
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function selectGuidedJourneyOption(
  journeyId: string,
  optionKey: string
): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ optionKey })
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function advanceGuidedJourney(
  journeyId: string,
  completeCurrentStep = true
): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/advance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completeCurrentStep })
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function backGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/back`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function completeGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function abandonGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function dismissGuidedJourney(journeyId: string): Promise<GuidedJourneyResponse> {
  const res = await apiFetch(`/guided-journeys/${journeyId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  return handleResponse<GuidedJourneyResponse>(res);
}

export async function getDailyPulse(params?: {
  markOpened?: boolean;
  refresh?: boolean;
}): Promise<DailyPulseApiResponse> {
  const query = new URLSearchParams();
  if (typeof params?.markOpened === "boolean") {
    query.set("markOpened", params.markOpened ? "true" : "false");
  }
  if (typeof params?.refresh === "boolean") {
    query.set("refresh", params.refresh ? "true" : "false");
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await apiFetch(`/daily-pulse${suffix}`, {
    cache: "no-store"
  });

  return handleResponse<DailyPulseApiResponse>(res);
}

export async function getDailyPulseState(): Promise<DailyPulseStateApiResponse> {
  const res = await apiFetch("/daily-pulse/state", {
    cache: "no-store"
  });

  return handleResponse<DailyPulseStateApiResponse>(res);
}

export async function trackDailyPulseAction(action: "COMPLETED" | "DISMISSED" | "POSTPONED") {
  const res = await apiFetch("/daily-pulse/track-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action })
  });

  return handleResponse<{
    date: string;
    openedAt?: string | null;
    completedCount: number;
    dismissedCount: number;
  }>(res);
}
