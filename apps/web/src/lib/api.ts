import type {
  CommandExecuteResponse,
  CommandParseResponse,
  Obligation,
  Reminder,
  ResolutionResponse,
  TodayFeedResponse
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";

const DEFAULT_USER_ID =
  process.env.NEXT_PUBLIC_LCB_USER_ID ||
  process.env.NEXT_PUBLIC_DEMO_USER_ID ||
  "usr_web_demo_001";
const DEFAULT_USER_EMAIL = process.env.NEXT_PUBLIC_LCB_USER_EMAIL || "";

type ApiError = Error & {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
};

function isSafeUserId(value: string) {
  return /^[a-zA-Z0-9._:-]{3,128}$/.test(value);
}

function getUserIdentity() {
  if (typeof window === "undefined") {
    return {
      userId: DEFAULT_USER_ID,
      userEmail: DEFAULT_USER_EMAIL
    };
  }

  const storedUserId = window.localStorage.getItem("lcb_user_id");
  const storedUserEmail = window.localStorage.getItem("lcb_user_email");
  const userId =
    storedUserId && isSafeUserId(storedUserId) ? storedUserId : DEFAULT_USER_ID;
  const userEmail = storedUserEmail || DEFAULT_USER_EMAIL;

  if (!storedUserId || storedUserId !== userId) {
    window.localStorage.setItem("lcb_user_id", userId);
  }

  if (userEmail && storedUserEmail !== userEmail) {
    window.localStorage.setItem("lcb_user_email", userEmail);
  }

  return { userId, userEmail };
}

function withAuthHeaders(headers?: HeadersInit) {
  const merged = new Headers(headers);
  const identity = getUserIdentity();

  merged.set("x-user-id", identity.userId);
  if (identity.userEmail) {
    merged.set("x-user-email", identity.userEmail);
  }

  return merged;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let parsed: unknown = null;

  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw;
    }
  }

  const body =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;

  if (!res.ok || body?.success === false) {
    const errorObj =
      body?.error && typeof body.error === "object"
        ? (body.error as Record<string, unknown>)
        : null;
    const message =
      (typeof errorObj?.message === "string" && errorObj.message) ||
      (typeof body?.message === "string" && body.message) ||
      `${res.status} ${res.statusText || "Request failed"}`;

    const error = new Error(message) as ApiError;
    error.status = res.status;
    if (typeof errorObj?.code === "string") {
      error.code = errorObj.code;
    }
    if (errorObj?.details && typeof errorObj.details === "object") {
      error.details = errorObj.details as Record<string, unknown>;
    }
    throw error;
  }

  return (body?.data ?? parsed) as T;
}

async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    cache: init.cache ?? "no-store",
    ...init,
    headers: withAuthHeaders(init.headers)
  });

  return handleResponse<T>(res);
}

export async function getTodayFeed() {
  return apiFetch<TodayFeedResponse>("/today-feed");
}

export async function getObligations() {
  return apiFetch<{
    items: Obligation[];
    pagination: {
      limit: number;
      offset: number;
      total: number;
    };
  }>("/obligations");
}

export async function getObligationById(obligationId: string) {
  return apiFetch<{ obligation: Obligation }>(`/obligations/${obligationId}`);
}

export async function getResolution(obligationId: string) {
  return apiFetch<ResolutionResponse>(`/obligations/${obligationId}/resolution`);
}

export async function getReminders() {
  return apiFetch<{ items: Reminder[] }>("/reminders");
}

export async function markObligationDone(obligationId: string, note?: string) {
  return apiFetch<{ obligation: Obligation }>(`/obligations/${obligationId}/mark-done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note })
  });
}

export async function dismissObligation(obligationId: string, reason?: string) {
  return apiFetch<{ obligation: Obligation }>(`/obligations/${obligationId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });
}

export async function postponeObligation(
  obligationId: string,
  until?: string,
  reason?: string
) {
  return apiFetch<{ obligation: Obligation }>(`/obligations/${obligationId}/postpone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ until, reason })
  });
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
}) {
  return apiFetch<{ feedbackEvent: { id: string } }>("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
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
}) {
  return apiFetch<{ obligation: Obligation }>("/obligations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function createReminder(input: {
  obligationId?: string;
  title: string;
  scheduledFor: string;
}) {
  return apiFetch<{ reminder: Reminder }>("/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch<{ uploadId: string; jobTriggered: boolean }>("/uploads", {
    method: "POST",
    body: formData
  });
}

export async function importEmailForward(input: {
  subject: string;
  from: string;
  bodyText: string;
}) {
  return apiFetch<{
    candidateObligationId: string;
    status: string;
    obligation: Obligation;
  }>("/imports/email-forward", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function parseCommand(input: {
  input: string;
  context?: { obligationId?: string };
}) {
  return apiFetch<CommandParseResponse>("/commands/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function executeCommand(input: {
  input: string;
  context?: { obligationId?: string };
}) {
  return apiFetch<CommandExecuteResponse>("/commands/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}
