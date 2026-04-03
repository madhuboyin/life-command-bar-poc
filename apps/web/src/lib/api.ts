import type {
  CommandExecuteResponse,
  CommandParseResponse,
  DashboardInsightsResponse,
  Obligation,
  ObligationHistory,
  Reminder,
  ResolutionResponse,
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

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
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

  if (isServer && SERVER_API_BASE_URL) {
    return stripTrailingSlash(SERVER_API_BASE_URL);
  }

  const fallbackBaseUrl =
    process.env.NODE_ENV === "development" ? "http://localhost:4000/api" : "/api";
  const rawBaseUrl = PUBLIC_API_BASE_URL || fallbackBaseUrl;

  if (isAbsoluteHttpUrl(rawBaseUrl)) {
    return stripTrailingSlash(rawBaseUrl);
  }

  if (!rawBaseUrl.startsWith("/")) {
    return stripTrailingSlash(rawBaseUrl);
  }

  if (!isServer) {
    return stripTrailingSlash(rawBaseUrl);
  }

  const serverOrigin = resolveServerOrigin();
  if (serverOrigin) {
    return stripTrailingSlash(new URL(rawBaseUrl, serverOrigin).toString());
  }

  return stripTrailingSlash(`http://localhost:4000${rawBaseUrl}`);
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

export async function getObligations(): Promise<ObligationsListResponse> {
  const res = await apiFetch("/obligations", {
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
