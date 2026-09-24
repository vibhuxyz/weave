export const HISTORY_ARCHIVE_VERSION = 1;
export const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
export const MAX_CLAUDE_SESSION_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_SUMMARY_CHARS = 64_000;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
export const COMPACT_SUMMARY_PREFIX =
  /^This session is being continued from a previous conversation that ran out of context\./;
export const CLAUDE_ENGINE_ID = "claude-code";
export const CLAUDE_PROJECTS_DIR = "projects";
export const CLAUDE_SESSION_SUFFIX = ".jsonl";
