export const MAX_LISTED_DIRTY_PATHS = 10;
export const MAX_SNAPSHOT_FILES = 2_000;
export const SNAPSHOT_MESSAGE = "weave: snapshot of uncommitted changes";
export const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
export const INSTALL_OUTPUT_TAIL_CHARS = 2_000;
export const IGNORED_DIRTY_BASENAMES: ReadonlySet<string> = new Set([
  ".DS_Store",
  "._.DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  "Thumbs.db",
  "desktop.ini",
]);

export const HARVEST_AUTHOR_NAME = "Weave";
export const HARVEST_AUTHOR_EMAIL = "weave@localhost";

export const HARVEST_EXCLUDES: readonly string[] = [
  ":(exclude)node_modules",
  ":(exclude,glob)**/node_modules/**",
];

export const HARVEST_EXCLUDED_PATHS: readonly string[] = [
  "node_modules",
  ":(glob)**/node_modules/**",
];

export const LOCKFILE_INSTALL_COMMANDS: readonly (readonly [lockfile: string, command: string])[] = [
  ["bun.lock", "bun install --frozen-lockfile"],
  ["bun.lockb", "bun install --frozen-lockfile"],
  ["pnpm-lock.yaml", "pnpm install --frozen-lockfile --prefer-offline"],
  ["yarn.lock", "yarn install --frozen-lockfile"],
  ["package-lock.json", "npm ci --no-audit --no-fund"],
];

export const FROZEN_LOCKFILE_FLAG = " --frozen-lockfile";
export const FROZEN_LOCKFILE_FAILURE = /lockfile had changes|lockfile is frozen|frozen-lockfile/i;
export const RELAXED_LOCKFILE_NOTE = "lockfile out of date, installed without --frozen-lockfile and restored the lockfile";
export const UNLOCKED_INSTALL_COMMAND = "npm install --no-audit --no-fund --no-package-lock";
