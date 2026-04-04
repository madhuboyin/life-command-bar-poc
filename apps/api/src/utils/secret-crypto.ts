import crypto from "crypto";
import { AppError } from "./app-error";

const CIPHER_ALGO = "aes-256-gcm";
const VERSION = "v1";

export function encryptSecret(plainText: string) {
  if (!plainText) {
    throw new AppError("VALIDATION_ERROR", "Secret value is required", 400);
  }

  const key = resolveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CIPHER_ALGO, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

export function decryptSecret(cipherText: string | null | undefined) {
  if (!cipherText) return null;

  const [version, ivRaw, tagRaw, payloadRaw] = cipherText.split(":");
  if (version !== VERSION || !ivRaw || !tagRaw || !payloadRaw) {
    throw new AppError("INTERNAL_ERROR", "Encrypted secret format is invalid", 500);
  }

  const key = resolveEncryptionKey();
  const decipher = crypto.createDecipheriv(
    CIPHER_ALGO,
    key,
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadRaw, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

function resolveEncryptionKey() {
  const configured = (
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY ||
    ""
  ).trim();

  if (!configured) {
    throw new AppError(
      "SERVICE_UNAVAILABLE",
      "Token encryption key is not configured",
      503,
      {
        hint: "Set TOKEN_ENCRYPTION_KEY (or GMAIL_TOKEN_ENCRYPTION_KEY)."
      }
    );
  }

  const decoded = decodeMaybeBase64(configured);
  if (decoded.length === 32) {
    return decoded;
  }

  return crypto.createHash("sha256").update(configured).digest();
}

function decodeMaybeBase64(value: string) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64");
    if (decoded.length > 0) {
      return decoded;
    }
  } catch {
    // Fall through.
  }

  return Buffer.from(value, "utf8");
}
