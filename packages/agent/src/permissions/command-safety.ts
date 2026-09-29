import type { CommandSafetyResult } from "./types.ts";
import { isInside, realish } from "./path-confinement.ts";
import { splitShellWords } from "./shell-words/index.ts";

const SENSITIVE_PATTERNS = [
  /(?:^|[\s"'`=])(~|\$HOME)\/(?:\.ssh|\.aws|\.gnupg|\.kube|\.config\/gcloud)/i,
  /(?:^|[\s"'`=])\/(?:Users|home)\/[^/\s"']+\/(?:\.ssh|\.aws|\.gnupg|\.kube)/i,
  /(?:^|[\s"'`=])\/(?:etc|private\/etc)\/(?:passwd|shadow|sudoers)/i,
];

const DESTRUCTIVE_ROOT_PATTERN =
  /(?:^|[\s"'`;])rm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(?:\/|~|\$HOME)(?:$|[\s"'`;])/i;

const TRAVERSAL_PATTERN = /(?:^|[\s"'`=])(?:\.\.\/|\/\.\.)/;

const USER_PATH_START = /(?:\/Users|\/home)\//g;
const PATH_UNTIL_WHITESPACE = /^[^\s"'`;]+/;
const PATH_UNTIL_WORD_END = /^[^"'`;]+/;
const TRAILING_PUNCTUATION = /[,:;)"']+$/;
const PARENT_SEGMENT = /(?:^|\/)\.\.(?:\/|$)/;

/**
 * Output an engine wrote for itself and has to read back.
 *
 * agy runs a command that outruns `WaitMsBeforeAsync` as a background task and
 * puts its output here, then reads it with `cat`. Refusing that leaves the
 * agent unable to collect the result of a search the user already approved.
 *
 * Anchored to the task-log leaf on purpose. The same tree holds
 * `antigravity-oauth-token`, which stays out of reach.
 */
const ENGINE_TASK_LOG_PATTERN =
  /^(?:\/Users|\/home)\/[^/]+\/\.gemini\/antigravity-cli\/brain\/[^/]+\/\.system_generated\/tasks\/[^/]+\.log$/;

/**
 * The directory a tool says it will run in.
 *
 * An engine may carry its own working directory in the call (agy sends `Cwd`)
 * rather than running where the session was opened. Weave checked the command
 * text and trusted the session's cwd, so a relative command aimed at another
 * worker's worktree read as "within task cwd". The directory is part of the
 * request and has to be checked like any path in it.
 */
export function extractWorkingDir(rawInput: unknown): string | null {
  if (rawInput == null || typeof rawInput !== "object") return null;
  const rec = rawInput as Record<string, unknown>;
  const dir = rec.Cwd ?? rec.cwd ?? rec.workingDir ?? rec.working_dir ?? rec.workingDirectory ?? rec.working_directory;
  return typeof dir === "string" && dir.trim() !== "" ? dir.trim() : null;
}

export function extractCommand(rawInput: unknown): string | null {
  if (rawInput == null) return null;
  if (typeof rawInput === "string") return rawInput.trim();
  if (typeof rawInput === "object") {
    const rec = rawInput as Record<string, unknown>;
    const cmd = rec.command ?? rec.cmd ?? rec.script ?? rec.CommandLine;
    if (typeof cmd === "string") return cmd.trim();
  }
  return null;
}

function checkSensitivePatterns(command: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(command));
}

function leadingPath(text: string, pattern: RegExp): string {
  return (pattern.exec(text)?.[0] ?? "").replace(TRAILING_PUNCTUATION, "");
}

function isAllowedPath(path: string, normalizedCwd: string): boolean {
  return ENGINE_TASK_LOG_PATTERN.test(path) || isInside(normalizedCwd, path);
}

function isSpacedPathInside(wordPath: string, unspacedPath: string, normalizedCwd: string): boolean {
  return wordPath !== unspacedPath && !PARENT_SEGMENT.test(wordPath) && isInside(normalizedCwd, wordPath);
}

function findOutsidePathInWord(word: string, normalizedCwd: string): string | null {
  for (const match of word.matchAll(USER_PATH_START)) {
    const rest = word.slice(match.index);
    const unspacedPath = leadingPath(rest, PATH_UNTIL_WHITESPACE);
    if (isAllowedPath(unspacedPath, normalizedCwd)) continue;
    const wordPath = leadingPath(rest, PATH_UNTIL_WORD_END);
    if (isSpacedPathInside(wordPath, unspacedPath, normalizedCwd)) continue;
    return wordPath;
  }
  return null;
}

function findOutsideUserPath(command: string, normalizedCwd: string): string | null {
  for (const word of splitShellWords(command)) {
    const outsidePath = findOutsidePathInWord(word, normalizedCwd);
    if (outsidePath) return outsidePath;
  }
  return null;
}

export function inspectCommandBoundaries(
  command: string,
  cwd: string,
  runsIn: string | null = null,
): CommandSafetyResult {
  const normalizedCwd = realish(cwd);

  if (runsIn !== null && !isInside(normalizedCwd, runsIn)) {
    return { allowed: false, reason: `runs in ${runsIn}, outside task cwd` };
  }

  if (checkSensitivePatterns(command)) {
    return {
      allowed: false,
      reason: "references sensitive credential or system directory",
    };
  }

  if (DESTRUCTIVE_ROOT_PATTERN.test(command)) {
    return {
      allowed: false,
      reason: "destructive command targeting root or home directory",
    };
  }

  if (TRAVERSAL_PATTERN.test(command)) {
    return {
      allowed: false,
      reason: "contains path traversal (..) escaping task directory",
    };
  }

  const outsidePath = findOutsideUserPath(command, normalizedCwd);
  if (outsidePath) {
    return {
      allowed: false,
      reason: `targets ${outsidePath}, outside task cwd`,
    };
  }

  return { allowed: true };
}
