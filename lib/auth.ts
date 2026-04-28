import { timingSafeEqual } from "crypto";

const AUTH_TOKEN_ENV_VARS = ["MCP_SERVER_AUTH_TOKEN", "SERVER_AUTH_TOKEN"] as const;

function getServerAuthToken(): string | undefined {
  for (const envVar of AUTH_TOKEN_ENV_VARS) {
    const token = process.env[envVar];
    if (token) return token;
  }
  return undefined;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; message: string };

export function checkAuth(authorizationHeader: string | null): AuthResult {
  const expectedToken = getServerAuthToken();

  if (!expectedToken) {
    return { ok: false, status: 500, message: "Server auth token is not configured" };
  }

  const provided = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : null;

  if (!provided) {
    return { ok: false, status: 401, message: "Unauthorized" };
  }

  try {
    const valid = timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(expectedToken)
    );
    return valid ? { ok: true } : { ok: false, status: 401, message: "Unauthorized" };
  } catch {
    return { ok: false, status: 401, message: "Unauthorized" };
  }
}
