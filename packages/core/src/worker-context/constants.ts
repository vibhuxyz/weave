export const MAX_WORKER_CONTEXT_BYTES = 24_000;
export const SECTION_BUDGETS = {
  project: 6_000,
  code: 6_000,
  rules: 3_000,
  skills: 4_000,
  state: 3_500,
} as const;
export const MAX_TASK_BYTES = 1_500;
export const MAX_SNIPPETS = 6;
export const MAX_SNIPPET_LINES = 40;
export const MAX_SNIPPET_BYTES = 1_500;
export const RULE_DIRS = [".weave/rules", ".agents/rules"] as const;
export const SKILL_DIRS = [".weave/skills", ".agents/skills"] as const;
