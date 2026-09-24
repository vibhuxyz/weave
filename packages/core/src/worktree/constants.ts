export const MAX_LISTED_DIRTY_PATHS = 10;
export const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
export const INSTALL_OUTPUT_TAIL_CHARS = 2_000;
export const HARVEST_AUTHOR_NAME = "Weave";
export const HARVEST_AUTHOR_EMAIL = "weave@localhost";

export const HARVEST_EXCLUDES: readonly string[] = [
  ":(exclude)node_modules",
  ":(exclude,glob)**/node_modules/**",
];

export const LOCKFILE_INSTALL_COMMANDS: readonly (readonly [lockfile: string, command: string])[] = [
  ["bun.lock", "bun install --frozen-lockfile"],
  ["bun.lockb", "bun install --frozen-lockfile"],
  ["pnpm-lock.yaml", "pnpm install --frozen-lockfile --prefer-offline"],
  ["yarn.lock", "yarn install --frozen-lockfile"],
  ["package-lock.json", "npm ci --no-audit --no-fund"],
];

export const UNLOCKED_INSTALL_COMMAND = "npm install --no-audit --no-fund --no-package-lock";
