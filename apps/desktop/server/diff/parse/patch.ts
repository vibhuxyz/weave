import { MAX_DIFF_FILES, MAX_LINES_PER_FILE } from "../constants.ts";
import { splitPath } from "./path-name.ts";
import { unquotePath } from "./unquote-path.ts";
import type { DiffHunk, DiffLine, FileDiff, FileDiffStatus, PatchPayload, SkippedFile } from "../types.ts";

const FILE_HEADER = /^diff --git (.+?) (.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const NEW_FILE = /^new file mode [0-7]{6}$/;
const DELETED_FILE = /^deleted file mode [0-7]{6}$/;
const RENAME_FROM = /^rename from (.+)$/;
const BINARY = /^Binary files .* differ$/;
const AB_PREFIX = /^[ab]\//;

interface Chunk {
  readonly path: string;
  readonly lines: readonly string[];
}

interface Builder {
  status: FileDiffStatus;
  oldPath?: string;
  hunks: DiffHunk[];
  lines: DiffLine[];
  oldStart: number;
  newStart: number;
  oldNo: number;
  newNo: number;
  prevOldEnd: number;
  additions: number;
  deletions: number;
  binary: boolean;
  truncated: boolean;
  started: boolean;
}

function newBuilder(): Builder {
  return {
    status: "modified",
    hunks: [],
    lines: [],
    oldStart: 0,
    newStart: 0,
    oldNo: 0,
    newNo: 0,
    prevOldEnd: 1,
    additions: 0,
    deletions: 0,
    binary: false,
    truncated: false,
    started: false,
  };
}

function splitFiles(patch: string): readonly Chunk[] {
  const chunks: Chunk[] = [];
  let path = "";
  let lines: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    const header = FILE_HEADER.exec(line);
    if (!header?.[2]) {
      if (path) lines.push(line);
      continue;
    }
    if (path) chunks.push({ path, lines });
    path = unquotePath(header[2]).replace(AB_PREFIX, "");
    lines = [];
  }
  if (path) chunks.push({ path, lines });
  return chunks;
}

function closeHunk(builder: Builder): void {
  if (builder.lines.length === 0) return;
  const gap = builder.oldStart - builder.prevOldEnd;
  builder.hunks.push({
    lines: builder.lines,
    oldStart: builder.oldStart,
    newStart: builder.newStart,
    ...(gap > 0 ? { skippedBefore: gap } : {}),
  });
  builder.prevOldEnd = builder.oldNo;
  builder.lines = [];
}

function openHunk(builder: Builder, match: RegExpExecArray): void {
  closeHunk(builder);
  builder.started = true;
  builder.oldStart = Number.parseInt(match[1] ?? "1", 10);
  builder.newStart = Number.parseInt(match[3] ?? "1", 10);
  builder.oldNo = builder.oldStart;
  builder.newNo = builder.newStart;
}

function pushLine(builder: Builder, raw: string): void {
  if (builder.lines.length >= MAX_LINES_PER_FILE) {
    builder.truncated = true;
    return;
  }
  const text = raw.slice(1);
  if (raw.charAt(0) === "+") {
    builder.lines.push({ kind: "add", newLine: builder.newNo, text });
    builder.newNo += 1;
    builder.additions += 1;
    return;
  }
  if (raw.charAt(0) === "-") {
    builder.lines.push({ kind: "del", oldLine: builder.oldNo, text });
    builder.oldNo += 1;
    builder.deletions += 1;
    return;
  }
  builder.lines.push({ kind: "context", oldLine: builder.oldNo, newLine: builder.newNo, text });
  builder.oldNo += 1;
  builder.newNo += 1;
}

function applyMeta(builder: Builder, line: string): void {
  if (NEW_FILE.test(line)) builder.status = "added";
  else if (DELETED_FILE.test(line)) builder.status = "deleted";
  else if (BINARY.test(line)) builder.binary = true;
  else {
    const renamed = RENAME_FROM.exec(line);
    if (renamed?.[1]) {
      builder.status = "renamed";
      builder.oldPath = unquotePath(renamed[1]).replace(AB_PREFIX, "");
    }
  }
}

function buildFile(chunk: Chunk): Builder {
  const builder = newBuilder();
  for (const line of chunk.lines) {
    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      openHunk(builder, hunk);
      continue;
    }
    if (!builder.started) {
      applyMeta(builder, line);
      continue;
    }
    if (line.startsWith("\\")) continue;
    if (line === "" || " +-".includes(line.charAt(0))) pushLine(builder, line);
  }
  closeHunk(builder);
  return builder;
}

function toFileDiff(chunk: Chunk, builder: Builder): FileDiff {
  return {
    ...splitPath(chunk.path),
    ...(builder.oldPath ? { oldPath: builder.oldPath } : {}),
    status: builder.status,
    additions: builder.additions,
    deletions: builder.deletions,
    hunks: builder.hunks,
    truncated: builder.truncated,
  };
}

export function parsePatch(patch: string): PatchPayload {
  const files: FileDiff[] = [];
  const skipped: SkippedFile[] = [];
  for (const chunk of splitFiles(patch)) {
    const builder = buildFile(chunk);
    if (builder.binary) skipped.push({ path: chunk.path, reason: "binary file" });
    else if (files.length >= MAX_DIFF_FILES) skipped.push({ path: chunk.path, reason: `over the ${String(MAX_DIFF_FILES)} file limit` });
    else files.push(toFileDiff(chunk, builder));
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped };
}
