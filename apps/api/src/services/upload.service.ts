import fs from "fs";
import path from "path";
import { prisma } from "../clients/prisma.client";
import { createAuditEvent } from "../observability/audit-event";
import { IngestionService } from "./ingestion.service";

type CreateUploadInput = {
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storagePath: string;
};

export class UploadService {
  private readonly ingestionService = new IngestionService();

  async createUploadAndIngest(input: CreateUploadInput) {
    const upload = await prisma.upload.create({
      data: {
        userId: input.userId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
        storagePath: input.storagePath,
        status: "PROCESSING"
      }
    });

    await createAuditEvent({
      userId: input.userId,
      eventType: "upload_created",
      metadata: {
        uploadId: upload.id,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize
      }
    });

    try {
      const extraction = this.extractText(input.storagePath, input.fileType, input.fileSize);

      const ingestion = await this.ingestionService.ingestUpload({
        userId: input.userId,
        uploadId: upload.id,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
        storagePath: input.storagePath,
        extractedText: extraction.text
      });

      await prisma.upload.update({
        where: {
          id: upload.id
        },
        data: {
          status: "PROCESSED"
        }
      });

      await createAuditEvent({
        userId: input.userId,
        obligationId: ingestion.obligationId ?? undefined,
        eventType: "upload_ingestion_completed",
        metadata: {
          uploadId: upload.id,
          extractionStatus: extraction.status,
          extractionNote: extraction.note,
          parseStatus: ingestion.parseStatus,
          confidence: ingestion.confidence
        }
      });

      return {
        upload,
        ingestion,
        extraction
      };
    } catch (error) {
      await prisma.upload.update({
        where: {
          id: upload.id
        },
        data: {
          status: "FAILED"
        }
      });

      await createAuditEvent({
        userId: input.userId,
        eventType: "upload_ingestion_failed",
        metadata: {
          uploadId: upload.id,
          fileName: input.fileName,
          error: error instanceof Error ? error.message : "unknown_error"
        }
      });

      throw error;
    }
  }

  ensureUploadDir(uploadDir: string) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return path.resolve(uploadDir);
  }

  private extractText(storagePath: string, fileType: string, fileSize: number) {
    const normalizedType = fileType.toLowerCase();

    if (!fs.existsSync(storagePath)) {
      return {
        text: null,
        status: "FAILED",
        note: "Stored file was not found on disk"
      } as const;
    }

    const maxReadableBytes = Number(process.env.UPLOAD_TEXT_EXTRACTION_MAX_BYTES || 2 * 1024 * 1024);
    if (fileSize > maxReadableBytes) {
      return {
        text: null,
        status: "PARTIAL",
        note: "File too large for synchronous text extraction"
      } as const;
    }

    if (isTextLikeMimeType(normalizedType)) {
      const text = fs.readFileSync(storagePath, "utf8");
      return {
        text: text.slice(0, 120_000),
        status: "EXTRACTED",
        note: null
      } as const;
    }

    if (normalizedType === "application/pdf") {
      return {
        text: null,
        status: "PARTIAL",
        note: "PDF uploaded. Text extraction is limited in v1 without OCR tooling."
      } as const;
    }

    return {
      text: null,
      status: "UNSUPPORTED",
      note: "File type stored; structured extraction is not available for this format in v1."
    } as const;
  }
}

function isTextLikeMimeType(mimeType: string) {
  if (mimeType.startsWith("text/")) return true;

  return [
    "application/json",
    "application/xml",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel"
  ].includes(mimeType);
}
