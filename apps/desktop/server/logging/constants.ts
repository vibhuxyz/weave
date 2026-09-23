import type { LogLevel } from "./types.ts";

export const MAX_FIELD_CHARS = 400;
export const MAX_FIELD_COUNT = 24;
export const MAX_ARRAY_ITEMS = 12;
export const MAX_VALUE_DEPTH = 2;

export const LOG_FILE_NAME = "server.log";
export const ROTATED_LOG_FILE_NAME = "server.1.log";
export const MAX_LOG_FILE_BYTES = 4 * 1024 * 1024;

export const DEFAULT_LOG_LEVEL: LogLevel = "debug";

export const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
