import { createHmac, timingSafeEqual } from "crypto";

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; message: string };

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  salt: string;
  jti: string;
}

function base64urlDecode(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function verifyJwt(token: string, secret: string, salt: string): AuthResult {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const [headerB64, payloadB64, receivedSig] = parts as [string, string, string];
  const message = `${headerB64}.${payloadB64}`;

  const expectedSig = createHmac("sha256", secret)
    .update(message)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  try {
    const sigMatch = timingSafeEqual(
      Buffer.from(receivedSig),
      Buffer.from(expectedSig),
    );
    if (!sigMatch) {
      return { ok: false, status: 401, message: "Unauthorized" };
    }
  } catch {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64)) as JwtPayload;
  } catch {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSec) {
    return { ok: false, status: 401, message: "Token expired" };
  }

  if (payload.salt !== salt) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  return { ok: true };
}

export function checkAuth(authorizationHeader: string | null): AuthResult {
  const jwtSecret = process.env["JWT_SECRET"];
  const jwtSalt   = process.env["JWT_SALT"];

  if (!jwtSecret || !jwtSalt) {
    return { ok: false, status: 500, message: "Server auth token is not configured" };
  }

  const provided = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : null;

  if (!provided) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  return verifyJwt(provided, jwtSecret, jwtSalt);
}
