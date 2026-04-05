import crypto from "crypto";

type ApiAccessTokenPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
};

export function verifyApiAccessToken(
  token: string,
  secret: string
): ApiAccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  if (!headerPart || !payloadPart || !signaturePart) return null;

  const signingInput = `${headerPart}.${payloadPart}`;
  const expectedSignature = signHmac(signingInput, secret);
  if (!timingSafeEqual(expectedSignature, signaturePart)) {
    return null;
  }

  const header = parseJson<{
    alg?: string;
    typ?: string;
  }>(decodeBase64Url(headerPart));
  if (!header || header.alg !== "HS256" || header.typ !== "JWT") {
    return null;
  }

  const payload = parseJson<ApiAccessTokenPayload>(decodeBase64Url(payloadPart));
  if (!payload) return null;
  if (payload.aud !== "lcb-api" || payload.iss !== "lcb-web") {
    return null;
  }
  if (!isSafeUserId(payload.sub)) return null;
  if (!isValidEmail(payload.email)) return null;

  const nowEpochSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= nowEpochSeconds) {
    return null;
  }
  if (!Number.isFinite(payload.iat) || payload.iat > nowEpochSeconds + 60) {
    return null;
  }

  return payload;
}

function signHmac(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function parseJson<T>(value: string) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isSafeUserId(value: string) {
  return /^[a-zA-Z0-9._:-]{3,128}$/.test(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

