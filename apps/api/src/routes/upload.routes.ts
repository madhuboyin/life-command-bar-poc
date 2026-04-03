import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createUpload } from "../controllers/upload.controller";
import { fail } from "../utils/api-response";

const DEFAULT_UPLOAD_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

const uploadMaxFileSizeBytes = parsePositiveInt(
  process.env.UPLOAD_MAX_FILE_SIZE_BYTES,
  DEFAULT_UPLOAD_MAX_FILE_SIZE_BYTES
);

const allowedMimeTypes = new Set(
  (process.env.UPLOAD_ALLOWED_MIME_TYPES || DEFAULT_ALLOWED_MIME_TYPES.join(","))
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), "uploads"));
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const baseName = path.basename(file.originalname);
    const safeBaseName =
      baseName
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 120) || "file";
    const safeName = `${Date.now()}-${safeBaseName}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: {
    files: 1,
    fileSize: uploadMaxFileSizeBytes
  },
  fileFilter: (_req, file, cb) => {
    const normalizedMime = file.mimetype.toLowerCase();
    if (!allowedMimeTypes.has(normalizedMime)) {
      cb(new Error(`UNSUPPORTED_MIME_TYPE:${normalizedMime}`));
      return;
    }

    cb(null, true);
  }
});

export const uploadRouter = Router();

uploadRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return fail(res, "FILE_TOO_LARGE", "Uploaded file is too large", 413, {
          maxBytes: uploadMaxFileSizeBytes
        });
      }

      return fail(res, "UPLOAD_VALIDATION_ERROR", error.message, 400);
    }

    if (
      error instanceof Error &&
      error.message.startsWith("UNSUPPORTED_MIME_TYPE:")
    ) {
      return fail(res, "UNSUPPORTED_MEDIA_TYPE", "File type is not allowed", 415, {
        allowedMimeTypes: Array.from(allowedMimeTypes)
      });
    }

    console.error(error);
    return fail(res, "INTERNAL_ERROR", "Could not process upload", 500);
  });
}, createUpload);
