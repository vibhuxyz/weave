import { MAX_DIFF_FILES } from "../constants.ts";
import { splitPath } from "./path-name.ts";
import type { FileDiffStatus, FileStat, SkippedFile, StatsPayload } from "../types.ts";

const NUMSTAT_ENTRY = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/;
const RENAME_CODE = /^[RC]/;

const STATUS_BY_CODE: Readonly<Record<string, FileDiffStatus>> = {
  A: "added",
  D: "deleted",
  M: "modified",
  R: "renamed",
  C: "renamed",
  T: "modified",
};

function records(stdout: Buffer): readonly string[] {
  return stdout.toString("utf8").split("\0");
}

function count(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseNameStatus(stdout: Buffer): ReadonlyMap<string, FileDiffStatus> {
  const parts = records(stdout);
  const byPath = new Map<string, FileDiffStatus>();
  for (let index = 0; index < parts.length; index += 1) {
    const code = parts[index];
    if (!code) continue;
    const status = STATUS_BY_CODE[code.charAt(0)] ?? "modified";
    const steps = RENAME_CODE.test(code) ? 2 : 1;
    const path = parts[index + steps];
    if (path) byPath.set(path, status);
    index += steps;
  }
  return byPath;
}

export function parseNumstat(
  stdout: Buffer,
  statusByPath: ReadonlyMap<string, FileDiffStatus>,
): StatsPayload {
  const parts = records(stdout);
  const files: FileStat[] = [];
  const skipped: SkippedFile[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const match = NUMSTAT_ENTRY.exec(parts[index] ?? "");
    if (!match) continue;
    const renamed = match[3] === "";
    const oldPath = renamed ? parts[index + 1] : undefined;
    const path = renamed ? parts[index + 2] : match[3];
    if (renamed) index += 2;
    if (!path) continue;
    if (match[1] === "-" || match[2] === "-") {
      skipped.push({ path, reason: "binary file" });
      continue;
    }
    if (files.length >= MAX_DIFF_FILES) {
      skipped.push({ path, reason: `over the ${String(MAX_DIFF_FILES)} file limit` });
      continue;
    }
    files.push({
      ...splitPath(path),
      ...(oldPath ? { oldPath } : {}),
      status: statusByPath.get(path) ?? (renamed ? "renamed" : "modified"),
      additions: count(match[1]),
      deletions: count(match[2]),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped };
}
