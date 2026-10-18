import { CONTEXT_LINES, MAX_EXPAND_LINES, MAX_PATCH_BYTES } from "./constants.ts";
import { rangeArgs, gitText, runGitStdout } from "./git/index.ts";
import { parseNameStatus, parseNumstat, parsePatch } from "./parse/index.ts";
import { readTextFile } from "../project/index.ts";
import { safeRelativePaths } from "./safe-path.ts";
import type { DiffRange, DiffResult, FileDiffStatus, PatchPayload, StatsPayload } from "./types.ts";

const DIFF_FLAGS = ["diff", "--no-color", "--no-ext-diff", "--find-renames"] as const;
const SAFE_REV = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,200}$/;

export async function readStats(cwd: string, range: DiffRange): Promise<DiffResult<StatsPayload>> {
  const args = await rangeArgs(cwd, range);
  if (!args.ok) return args;
  const [numstat, nameStatus] = await Promise.all([
    runGitStdout(cwd, [...DIFF_FLAGS, "--numstat", "-z", ...args.value]),
    runGitStdout(cwd, [...DIFF_FLAGS, "--name-status", "-z", ...args.value]),
  ]);
  if (!numstat.ok) return numstat;
  const statuses = nameStatus.ok ? parseNameStatus(nameStatus.value.stdout) : new Map<string, FileDiffStatus>();
  return { ok: true, value: parseNumstat(numstat.value.stdout, statuses) };
}

export async function readPatch(
  cwd: string,
  range: DiffRange,
  requestedPaths: readonly string[],
): Promise<DiffResult<PatchPayload>> {
  const args = await rangeArgs(cwd, range);
  if (!args.ok) return args;
  const scoped = await safeRelativePaths(cwd, requestedPaths);
  if (!scoped.ok) return scoped;
  const pathArgs = scoped.value.length > 0 ? ["--", ...scoped.value] : [];
  const flags = [...DIFF_FLAGS, `--unified=${String(CONTEXT_LINES)}`, ...args.value, ...pathArgs];
  const run = await runGitStdout(cwd, flags, MAX_PATCH_BYTES);
  if (!run.ok) return run;
  const parsed = parsePatch(run.value.stdout.toString("utf8"));
  if (!run.value.truncated) return { ok: true, value: parsed };
  const cut = { path: "", reason: `diff cut at ${String(MAX_PATCH_BYTES)} bytes` };
  return { ok: true, value: { files: parsed.files, skipped: [...parsed.skipped, cut] } };
}

async function fileLines(cwd: string, path: string, rev: string | null): Promise<DiffResult<readonly string[]>> {
  if (rev === null) {
    const read = await readTextFile(cwd, path);
    return read.ok ? { ok: true, value: read.content.split(/\r?\n/) } : { ok: false, reason: read.reason };
  }
  if (!SAFE_REV.test(rev) || rev.includes("..")) return { ok: false, reason: `Not a usable revision: ${rev}` };
  const shown = await gitText(cwd, ["show", `${rev}:${path}`]);
  return shown.ok ? { ok: true, value: shown.value.split(/\r?\n/) } : shown;
}

export async function readContextLines(
  cwd: string,
  path: string,
  rev: string | null,
  from: number,
  to: number,
): Promise<DiffResult<readonly string[]>> {
  const scoped = await safeRelativePaths(cwd, [path]);
  if (!scoped.ok) return scoped;
  const start = Math.max(1, Math.floor(from));
  const end = Math.max(start, Math.min(Math.floor(to), start + MAX_EXPAND_LINES - 1));
  const lines = await fileLines(cwd, path, rev);
  if (!lines.ok) return lines;
  return { ok: true, value: lines.value.slice(start - 1, end) };
}
