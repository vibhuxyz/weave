import type { CommandSafetyResult } from "./types.ts";
import { isInside, realish } from "./path-confinement.ts";

const SENSITIVE_PATTERNS = [
  /(?:^|[\s"'`=])(~|\$HOME)\/(?:\.ssh|\.aws|\.gnupg|\.kube|\.config\/gcloud)/i,
  /(?:^|[\s"'`=])\/(?:Users|home)\/[^/\s"']+\/(?:\.ssh|\.aws|\.gnupg|\.kube)/i,
  /(?:^|[\s"'`=])\/(?:etc|private\/etc)\/(?:passwd|shadow|sudoers)/i,
];

const DESTRUCTIVE_ROOT_PATTERN =
  /(?:^|[\s"'`;])rm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(?:\/|~|\$HOME)(?:$|[\s"'`;])/i;

const TRAVERSAL_PATTERN = /(?:^|[\s"'`=])(?:\.\.\/|\/\.\.)/;

const USER_PATH_PATTERN = /(?:\/Users|\/home)\/[^\s"'`;]+/g;

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

function findOutsideUserPath(command: string, normalizedCwd: string): string | null {
  const matches = command.match(USER_PATH_PATTERN);
  if (!matches) return null;
  for (const rawPath of matches) {
    const cleanPath = rawPath.replace(/[,:;)"']+$/, "");
    if (ENGINE_TASK_LOG_PATTERN.test(cleanPath)) continue;
    if (!isInside(normalizedCwd, cleanPath)) {
      return cleanPath;
    }
  }
  return null;
}

export function inspectCommandBoundaries(
  command: string,
  cwd: string,
): CommandSafetyResult {
  const normalizedCwd = realish(cwd);

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
