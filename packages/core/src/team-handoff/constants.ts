export const TEAM_HANDOFF_PROMPT_VERSION = 7;

export const HANDOFF_BLOCK = /```weave-handoff[ \t]*\r?\n([\s\S]*?)\r?\n?```/g;

export const MAX_HANDOFF_JSON_CHARS = 8_000;
export const MAX_HANDOFF_REASON_CHARS = 300;
export const MAX_HANDOFF_ITEMS = 10;
export const MAX_HANDOFF_ITEM_CHARS = 300;
export const MAX_HANDOFF_PATHS = 8;
export const MAX_HANDOFF_PATH_CHARS = 200;
export const HANDOFF_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const CLIPPED_MARK = "…";

export const NOTES_TAG = "chat-agent-notes";
