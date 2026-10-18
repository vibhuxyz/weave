export const MAX_HANDOFF_BYTES = 8192;
export const MAX_RECENT_TURNS = 6;
export const MAX_OLDER_TURN_LINES = 30;
export const MAX_LOADED_TURNS = MAX_RECENT_TURNS + MAX_OLDER_TURN_LINES;

export const MAX_STORED_TEXT_BYTES = 4096;
export const MAX_CAPTURED_ANSWER_CHARS = 16_000;
export const MAX_TURN_FILES = 40;
export const MAX_TRACKED_FILES = 2000;
export const MAX_TRACKED_TOOLS = 5000;
export const MAX_TURN_COMMANDS = 20;
export const MAX_TURN_FAILURES = 10;
export const MAX_FACT_CHARS = 200;
export const MAX_WORKSPACE_PATHS = 40;

export const LAST_USER_CHARS = 2000;
export const RECENT_USER_CHARS = 600;
export const RECENT_ANSWER_CHARS = 1200;
export const SHORT_ANSWER_CHARS = 300;
export const OLDER_LINE_CHARS = 220;
export const LISTED_FILES_PER_TURN = 8;
export const LISTED_COMMANDS_PER_TURN = 5;

export const HANDOFF_TAG = "weave-handoff";
export const FILE_CHANGING_KINDS: ReadonlySet<string> = new Set(["edit", "delete", "move"]);
export const COMMAND_KIND = "execute";
export const MAX_RUN_ANSWER_CHARS_PER_TASK = 4000;
export const MAX_RUN_BRIEF_BYTES = 6000;
export const RUN_RESULT_TAG = "team-run-result";
export const MAX_LISTED_RUN_FILES = 20;
