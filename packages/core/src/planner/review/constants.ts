export const REVIEW_STATUSES = ["approved", "changes_requested"] as const;
export const REVIEW_ISSUE_TYPES = [
  "missing_dependency",
  "unneeded_dependency",
  "bad_split",
  "missing_task",
  "wrong_employee",
  "missing_verification",
  "other",
] as const;

export const MAX_REVIEW_ISSUES = 8;
export const MAX_ISSUE_REASON_CHARS = 300;
export const MAX_ISSUE_TASK_IDS = 6;
export const MAX_NEW_TASK_ID_CHARS = 32;
export const MAX_PLANNING_BRIEF_BYTES = 24_000;
export const MAX_REVIEW_PLAN_BYTES = 64_000;
export const MAX_REVIEW_TASK_PROMPT_BYTES = 4_000;

export const MIN_TASKS_FOR_REVIEW = 3;
export const REVIEWED_SCOPES = ["cross-module", "cross-service", "new-project"] as const;
export const REVIEWED_RISK = "high";
