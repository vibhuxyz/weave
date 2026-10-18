import { readdir } from "node:fs/promises";
import { runCommand } from "../verify/index.ts";
import {
  FROZEN_LOCKFILE_FAILURE,
  FROZEN_LOCKFILE_FLAG,
  HARVEST_EXCLUDES,
  INSTALL_OUTPUT_TAIL_CHARS,
  INSTALL_TIMEOUT_MS,
  LOCKFILE_INSTALL_COMMANDS,
  MAX_LISTED_DIRTY_PATHS,
  RELAXED_LOCKFILE_NOTE,
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

interface InstallRun {
  readonly ok: boolean;
  readonly output: string;
  readonly durationMs: number;
}

async function timedInstall(command: string, path: string, timeoutMs: number): Promise<InstallRun> {
  const started = Date.now();
  const result = await runCommand(command, path, timeoutMs);
  return { ok: result.ok, output: result.output, durationMs: Date.now() - started };
}

function isFrozenLockfileFailure(command: string, run: InstallRun): boolean {
  return !run.ok && command.includes(FROZEN_LOCKFILE_FLAG) && FROZEN_LOCKFILE_FAILURE.test(run.output);
}

async function restoreLockfiles(path: string, entries: ReadonlySet<string>): Promise<void> {
  const lockfiles = LOCKFILE_INSTALL_COMMANDS.map(([lockfile]) => lockfile).filter((lockfile) => entries.has(lockfile));
  if (lockfiles.length > 0) await runGit(path, ["checkout", "--", ...lockfiles]);
}

export async function installWorktree(path: string, timeoutMs = INSTALL_TIMEOUT_MS): Promise<InstallOutcome> {
  const entries = new Set(await readdir(path));
  const command = detectInstallCommand(entries);
  if (!command) return { status: "skipped", reason: "no package.json in the worktree root" };
  const first = await timedInstall(command, path, timeoutMs);
  const isRelaxed = isFrozenLockfileFailure(command, first);
  const relaxedCommand = command.replace(FROZEN_LOCKFILE_FLAG, "");
  const retry = isRelaxed ? await timedInstall(relaxedCommand, path, timeoutMs) : null;
  const run = retry ?? first;
  const usedCommand = retry ? relaxedCommand : command;
  const durationMs = first.durationMs + (retry?.durationMs ?? 0);
  const outputTail = run.output.slice(-INSTALL_OUTPUT_TAIL_CHARS);
  if (!run.ok) return { status: "failed", command: usedCommand, durationMs, outputTail };
  if (retry) await restoreLockfiles(path, entries);
  const changed = await filesChangedByInstall(path);
  if (changed.length > 0) return { status: "failed", command: usedCommand, durationMs, outputTail: describeInstallChanges(changed) };
  return { status: "ok", command: usedCommand, durationMs, outputTail: retry ? `${RELAXED_LOCKFILE_NOTE}\n${outputTail}` : outputTail };
}
