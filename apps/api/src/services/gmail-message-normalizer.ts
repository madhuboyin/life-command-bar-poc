import { AppError } from "../utils/app-error";

export type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: {
    size?: number;
    data?: string;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
};

export type GmailApiMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

export type NormalizedGmailMessage = {
  gmailMessageId: string;
  gmailThreadId: string | null;
  historyId: string | null;
  labelIds: string[];
  from: string;
  subject: string;
  messageDate: string | null;
  internalDate: string | null;
  snippet: string;
  bodyText: string;
};

export function normalizeGmailMessage(message: GmailApiMessage): NormalizedGmailMessage {
  if (!message.id) {
    throw new AppError("VALIDATION_ERROR", "Gmail message id is required", 400);
  }

  const payload = message.payload;
  const headers = collectHeaders(payload);
  const subject = sanitizeHeaderValue(headers.subject) || "Gmail import";
  const from = sanitizeHeaderValue(headers.from) || "Unknown sender";
  const headerDate = sanitizeHeaderValue(headers.date);

  const plainText = pickBestBodyText(payload);
  const snippet = normalizeSnippet(message.snippet ?? "");

  const internalDate = parseInternalDate(message.internalDate);
  const messageDate = parseMessageDate(headerDate, internalDate);

  const bodyText = normalizeBodyText(plainText || snippet);

  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId ?? null,
    historyId: message.historyId ?? null,
    labelIds: [...(message.labelIds ?? [])].sort(),
    from,
    subject,
    messageDate,
    internalDate,
    snippet,
    bodyText
  };
}

function collectHeaders(part?: GmailMessagePart) {
  const headers = part?.headers ?? [];
  const byKey = new Map<string, string>();

  for (const header of headers) {
    if (!header?.name || !header?.value) continue;
    const key = header.name.trim().toLowerCase();
    if (!key || byKey.has(key)) continue;
    byKey.set(key, header.value.trim());
  }

  return {
    subject: byKey.get("subject") ?? "",
    from: byKey.get("from") ?? "",
    date: byKey.get("date") ?? ""
  };
}

function pickBestBodyText(part?: GmailMessagePart): string {
  if (!part) return "";

  const plainParts = collectPartsByMime(part, "text/plain");
  for (const candidate of plainParts) {
    const decoded = decodeBody(candidate);
    const normalized = normalizeBodyText(decoded);
    if (normalized) return normalized;
  }

  const htmlParts = collectPartsByMime(part, "text/html");
  for (const candidate of htmlParts) {
    const decoded = decodeBody(candidate);
    const normalized = normalizeBodyText(stripHtml(decoded));
    if (normalized) return normalized;
  }

  const fallback = decodeBody(part);
  return normalizeBodyText(fallback);
}

function collectPartsByMime(part: GmailMessagePart, mimeType: string): GmailMessagePart[] {
  const matches: GmailMessagePart[] = [];
  const stack: GmailMessagePart[] = [part];

  while (stack.length > 0) {
    const current = stack.pop() as GmailMessagePart;
    if (current.mimeType?.toLowerCase() === mimeType) {
      matches.push(current);
    }

    for (const child of current.parts ?? []) {
      stack.push(child);
    }
  }

  return matches;
}

function decodeBody(part?: GmailMessagePart) {
  const raw = part?.body?.data;
  if (!raw) return "";

  try {
    return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"');
}

function parseInternalDate(value?: string) {
  if (!value) return null;
  const millis = Number(value);
  if (!Number.isFinite(millis) || millis <= 0) return null;

  const parsed = new Date(millis);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseMessageDate(rawDate: string, fallbackIso: string | null) {
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return fallbackIso;
}

function normalizeBodyText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]+/g, " ")
    .trim()
    .slice(0, 20000);
}

function normalizeSnippet(value: string) {
  return value.replace(/[\t\n ]+/g, " ").trim().slice(0, 600);
}

function sanitizeHeaderValue(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\t\n ]+/g, " ")
    .trim()
    .slice(0, 600);
}
