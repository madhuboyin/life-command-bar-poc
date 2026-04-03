const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api"\;

async function handleResponse(res: Response) {
  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json?.error?.message || "Request failed");
  }

  return json.data;
}

export async function getTodayFeed() {
  const res = await fetch(`${API_BASE_URL}/today-feed`, {
    cache: "no-store"
  });

  return handleResponse(res);
}

export async function getObligations() {
  const res = await fetch(`${API_BASE_URL}/obligations`, {
    cache: "no-store"
  });

  return handleResponse(res);
}

export async function getObligationById(obligationId: string) {
  const res = await fetch(`${API_BASE_URL}/obligations/${obligationId}`, {
    cache: "no-store"
  });

  return handleResponse(res);
}

export async function getResolution(obligationId: string) {
  const res = await fetch(`${API_BASE_URL}/obligations/${obligationId}/resolution`, {
    cache: "no-store"
  });

  return handleResponse(res);
}

export async function getReminders() {
  const res = await fetch(`${API_BASE_URL}/reminders`, {
    cache: "no-store"
  });

  return handleResponse(res);
}

export async function markObligationDone(obligationId: string, note?: string) {
  const res = await fetch(`${API_BASE_URL}/obligations/${obligationId}/mark-done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note })
  });

  return handleResponse(res);
}

export async function dismissObligation(obligationId: string, reason?: string) {
  const res = await fetch(`${API_BASE_URL}/obligations/${obligationId}/dismiss`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  });

  return handleResponse(res);
}

export async function postponeObligation(
  obligationId: string,
  until?: string,
  reason?: string
) {
  const res = await fetch(`${API_BASE_URL}/obligations/${obligationId}/postpone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ until, reason })
  });

  return handleResponse(res);
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
  const res = await fetch(`${API_BASE_URL}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse(res);
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
  const res = await fetch(`${API_BASE_URL}/obligations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse(res);
}

export async function createReminder(input: {
  obligationId?: string;
  title: string;
  scheduledFor: string;
}) {
  const res = await fetch(`${API_BASE_URL}/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse(res);
}

export async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/uploads`, {
    method: "POST",
    body: formData
  });

  return handleResponse(res);
}

export async function importEmailForward(input: {
  subject: string;
  from: string;
  bodyText: string;
}) {
  const res = await fetch(`${API_BASE_URL}/imports/email-forward`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse(res);
}

export async function parseCommand(input: {
  input: string;
  context?: { obligationId?: string };
}) {
  const res = await fetch(`${API_BASE_URL}/commands/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse(res);
}

export async function executeCommand(input: {
  input: string;
  context?: { obligationId?: string };
}) {
  const res = await fetch(`${API_BASE_URL}/commands/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return handleResponse(res);
}
