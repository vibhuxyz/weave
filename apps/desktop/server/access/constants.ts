export const SERVER_TOKEN_ENV = "WEAVE_SERVER_TOKEN";
export const MIN_SERVER_TOKEN_CHARS = 32;
export const MAX_SERVER_TOKEN_CHARS = 256;
export const SERVER_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export const WEAVE_PROTOCOL = "weave.v1";
export const TOKEN_PROTOCOL_PREFIX = "weave.token.";
export const PROTOCOL_LIST_SEPARATOR = /\s*,\s*/;

export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:5180",
  "http://127.0.0.1:5180",
]);

export const HTTP_STATUS_TEXT = {
  401: "Unauthorized",
  403: "Forbidden",
} as const;
