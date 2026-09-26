export const MAX_FAST_REQUEST_CHARS = 200;

export const SMALL_EDITS = [
  { name: "typo fix", taskType: "docs", pattern: /^(?:please\s+)?(?:fix|correct)\s+(?:an?\s+|the\s+)?(?:typo|spelling|misspelling)s?\b/i },
  { name: "text change", taskType: "chore", pattern: /^(?:please\s+)?(?:change|update|replace|reword)\s+(?:the\s+)?(?:text|label|copy|title|wording|message|comment|placeholder|string)\b/i },
  { name: "version bump", taskType: "chore", pattern: /^(?:please\s+)?bump\s/i },
  { name: "unused code removal", taskType: "refactor", pattern: /^(?:please\s+)?remove\s+(?:an?\s+|the\s+)?unused\b/i },
] as const;

export const RISKY_WORDS = /\b(?:auth\w*|login|password|secret|token|payments?|billing|migrations?|schema|database|security|permissions?|delete|drop|deploy\w*|env)\b/i;

export const PATH_TOKEN = /(?:^|[\s`'"(])(?:\.\/)?((?:[\w@.-]+\/)*[\w@-][\w@.-]*\.[A-Za-z0-9]{1,8})(?=$|[\s`'"),:;!?]|\.(?:\s|$))/g;
