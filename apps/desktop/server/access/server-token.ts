import { MAX_SERVER_TOKEN_CHARS, MIN_SERVER_TOKEN_CHARS, SERVER_TOKEN_ENV, SERVER_TOKEN_PATTERN } from "./constants.ts";
import type { TokenResult } from "./types.ts";

export function parseServerToken(raw: string | undefined): TokenResult {
  if (raw === undefined || raw === "") {
    return { ok: false, reason: `${SERVER_TOKEN_ENV} is not set; the app passes it when it starts the server.` };
  }
  if (raw.length < MIN_SERVER_TOKEN_CHARS || raw.length > MAX_SERVER_TOKEN_CHARS) {
    return {
      ok: false,
      reason: `${SERVER_TOKEN_ENV} must be ${MIN_SERVER_TOKEN_CHARS}-${MAX_SERVER_TOKEN_CHARS} characters, got ${raw.length}.`,
    };
  }
  if (!SERVER_TOKEN_PATTERN.test(raw)) {
    return { ok: false, reason: `${SERVER_TOKEN_ENV} may only contain letters, digits, "-" and "_".` };
  }
  return { ok: true, token: raw };
}
