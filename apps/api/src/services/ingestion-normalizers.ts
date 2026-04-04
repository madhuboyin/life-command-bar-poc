import crypto from "crypto";
import { ImportSourceSubtype, ImportSourceType, ObligationSource } from "@prisma/client";

export type IngestionChannel =
  | "EMAIL_FORWARD"
  | "EMAIL_GMAIL"
  | "FILE_UPLOAD"
  | "COMMAND_CAPTURE";

export interface NormalizedIngestionInput {
  userId: string;
  channel: IngestionChannel;
  importType: ImportSourceType;
  importSubtype: ImportSourceSubtype;
  obligationSource: ObligationSource;
  rawText: string;
  normalizedText: string;
  contentHash: string;
  titleHint: string | null;
  metadata: Record<string, unknown>;
}

type EmailForwardPayload = {
  userId: string;
  subject: string;
  from: string;
  bodyText: string;
};

type CommandCapturePayload = {
  userId: string;
  input: string;
  context?: {
    obligationId?: string;
  };
};

type UploadIngestionPayload = {
  userId: string;
  uploadId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
  extractedText?: string | null;
};

type GmailReadonlyIngestionPayload = {
  userId: string;
  externalConnectionId: string;
  gmailMessageId: string;
  gmailThreadId?: string | null;
  matchedQueryKey: string;
  historyId?: string | null;
  from: string;
  subject: string;
  bodyText: string;
  snippet?: string | null;
  labelIds?: string[];
  messageDate?: string | null;
  internalDate?: string | null;
  subscriptionLifecycle?: Record<string, unknown> | null;
};

export function normalizeEmailForwardInput(payload: EmailForwardPayload): NormalizedIngestionInput {
  const subject = payload.subject.trim();
  const from = payload.from.trim();
  const body = payload.bodyText.trim();

  const rawText = [subject, body].filter(Boolean).join("\n\n");
  const normalizedText = normalizeText(rawText);

  return {
    userId: payload.userId,
    channel: "EMAIL_FORWARD",
    importType: ImportSourceType.EMAIL,
    importSubtype: ImportSourceSubtype.EMAIL_FORWARD,
    obligationSource: ObligationSource.EMAIL,
    rawText,
    normalizedText,
    contentHash: buildContentHash("EMAIL_FORWARD", from, subject, normalizedText),
    titleHint: subject || null,
    metadata: {
      subject,
      from,
      bodyText: body
    }
  };
}

export function normalizeCommandCaptureInput(
  payload: CommandCapturePayload
): NormalizedIngestionInput {
  const input = payload.input.trim();
  const normalizedText = normalizeText(input);

  return {
    userId: payload.userId,
    channel: "COMMAND_CAPTURE",
    importType: ImportSourceType.MANUAL,
    importSubtype: ImportSourceSubtype.COMMAND_CAPTURE,
    obligationSource: ObligationSource.INFERRED,
    rawText: input,
    normalizedText,
    contentHash: buildContentHash("COMMAND_CAPTURE", normalizedText),
    titleHint: input.slice(0, 120) || null,
    metadata: {
      input,
      context: payload.context ?? null
    }
  };
}

export function normalizeUploadInput(payload: UploadIngestionPayload): NormalizedIngestionInput {
  const extractedText = (payload.extractedText ?? "").trim();
  const rawText = extractedText || payload.fileName;
  const normalizedText = normalizeText(rawText);

  return {
    userId: payload.userId,
    channel: "FILE_UPLOAD",
    importType: ImportSourceType.DOCUMENT,
    importSubtype: ImportSourceSubtype.FILE_UPLOAD,
    obligationSource: ObligationSource.DOCUMENT,
    rawText,
    normalizedText,
    contentHash: buildContentHash(
      "FILE_UPLOAD",
      payload.fileName,
      payload.fileType,
      String(payload.fileSize),
      normalizedText
    ),
    titleHint: payload.fileName,
    metadata: {
      uploadId: payload.uploadId,
      fileName: payload.fileName,
      fileType: payload.fileType,
      fileSize: payload.fileSize,
      storagePath: payload.storagePath,
      extractedTextLength: extractedText.length
    }
  };
}

export function normalizeGmailReadonlyInput(
  payload: GmailReadonlyIngestionPayload
): NormalizedIngestionInput {
  const subject = payload.subject.trim();
  const from = payload.from.trim();
  const bodyText = payload.bodyText.trim();
  const snippet = (payload.snippet ?? "").trim();

  const rawText = [subject, bodyText || snippet].filter(Boolean).join("\n\n");
  const normalizedText = normalizeText(rawText);

  return {
    userId: payload.userId,
    channel: "EMAIL_GMAIL",
    importType: ImportSourceType.EMAIL,
    importSubtype: ImportSourceSubtype.GMAIL_READONLY,
    obligationSource: ObligationSource.EMAIL,
    rawText,
    normalizedText,
    contentHash: buildContentHash(
      "EMAIL_GMAIL",
      payload.externalConnectionId,
      payload.gmailMessageId,
      payload.internalDate ?? "",
      normalizedText
    ),
    titleHint: subject || null,
    metadata: {
      externalConnectionId: payload.externalConnectionId,
      gmailMessageId: payload.gmailMessageId,
      gmailThreadId: payload.gmailThreadId ?? null,
      matchedQueryKey: payload.matchedQueryKey,
      historyId: payload.historyId ?? null,
      from,
      subject,
      bodyText,
      snippet: snippet || null,
      labelIds: payload.labelIds ?? [],
      messageDate: payload.messageDate ?? null,
      internalDate: payload.internalDate ?? null,
      subscriptionLifecycle: payload.subscriptionLifecycle ?? null
    }
  };
}

export function normalizeText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]+/g, " ")
    .trim();
}

function buildContentHash(...parts: string[]) {
  const hash = crypto.createHash("sha256");
  hash.update(parts.join("|"));
  return hash.digest("hex");
}
