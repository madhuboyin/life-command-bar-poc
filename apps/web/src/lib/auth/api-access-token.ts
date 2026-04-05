import crypto from "crypto";

type ApiTokenClaims = {
  userId: string;
  email: string;
  expiresInSeconds?: number;
};

export function createApiAccessToken(
  claims: ApiTokenClaims,
  secret: string
) {
  const nowEpoch = Math.floor(Date.now() / 1000);
  const ttl = claims.expiresInSeconds ?? 60 * 60 * 12;
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const payload = {
    sub: claims.userId,
    email: claims.email,
    iat: nowEpoch,
    exp: nowEpoch + ttl,
    iss: "lcb-web",
    aud: "lcb-api"
  };

  const headerPart = base64UrlJson(header);
  const payloadPart = base64UrlJson(payload);
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  return {
    token: `${signingInput}.${signature}`,
    expiresAtEpoch: payload.exp
  };
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

