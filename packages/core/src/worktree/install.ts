import { readdir } from "node:fs/promises";
import { runCommand } from "../verify/index.ts";
import {
  HARVEST_EXCLUDES,
  INSTALL_OUTPUT_TAIL_CHARS,
  INSTALL_TIMEOUT_MS,
  LOCKFILE_INSTALL_COMMANDS,
  MAX_LISTED_DIRTY_PATHS,
  UNLOCKED_INSTALL_COMMAND,
} from "./constants.ts";
import { outputLines, runGit } from "./run-git.ts";
import type { InstallOutcome } from "./types.ts";

export function detectInstallCommand(entries: ReadonlySet<string>): string | null {
  const locked = LOCKFILE_INSTALL_COMMANDS.find(([lockfile]) => entries.has(lockfile));
  if (locked) return locked[1];
  return entries.has("package.json") ? UNLOCKED_INSTALL_COMMAND : null;
}

async function filesChangedByInstall(path: string): Promise<readonly string[]> {
  const status = await runGit(path, ["status", "--porcelain", "--untracked-files=all", "--", ".", ...HARVEST_EXCLUDES]);
  return status.ok ? outputLines(status.output) : [`git status failed: ${status.output.trim()}`];
}

function describeInstallChanges(changed: readonly string[]): string {
  const listed = changed.slice(0, MAX_LISTED_DIRTY_PATHS).join(", ");
  const more = changed.length > MAX_LISTED_DIRTY_PATHS ? ` (+${changed.length - MAX_LISTED_DIRTY_PATHS} more)` : "";
  return `install changed files in the worktree (${listed}${more}); they would be blamed on the worker`;
}

export async function installWorktree(path: string, timeoutMs = INSTALL_TIMEOUT_MS): Promise<InstallOutcome> {
  const command = detectInstallCommand(new Set(await readdir(path)));
  if (!command) return { status: "skipped", reason: "no package.json in the worktree root" };
  const started = Date.now();
  const result = await runCommand(command, path, timeoutMs);
  const durationMs = Date.now() - started;
  const outputTail = result.output.slice(-INSTALL_OUTPUT_TAIL_CHARS);
  if (!result.ok) return { status: "failed", command, durationMs, outputTail };
  const changed = await filesChangedByInstall(path);
  if (changed.length > 0) return { status: "failed", command, durationMs, outputTail: describeInstallChanges(changed) };
  return { status: "ok", command, durationMs, outputTail };
}
