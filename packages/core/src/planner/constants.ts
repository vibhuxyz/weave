export const MAX_PLAN_TASKS = 12;
export const MAX_TASK_ID_CHARS = 32;
export const MAX_TITLE_CHARS = 120;
export const MAX_TASK_PROMPT_CHARS = 4000;
export const MAX_REASON_CHARS = 500;
export const MAX_PATHS_PER_TASK = 20;
export const MAX_PATH_CHARS = 200;
export const MAX_DEPENDENCIES_PER_TASK = 8;
export const MAX_REQUIRED_OUTPUTS = 10;
export const MAX_SYMBOL_CHARS = 100;
export const MAX_SYMBOLS_PER_TASK = 20;
export const MAX_VERIFY_COMMAND_CHARS = 300;
export const MAX_REQUEST_BYTES = 8192;
export const MAX_REPAIR_ISSUES = 10;
export const MAX_REPAIR_ISSUE_CHARS = 300;

export const TASK_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export const COMPONENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
