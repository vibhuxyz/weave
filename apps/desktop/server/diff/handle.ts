import { MAX_COMMITS } from "./constants.ts";
import { readCommits, readRefs } from "./git/index.ts";
import { readContextLines, readPatch, readStats } from "./read.ts";
import type { DiffRange, DiffResult } from "./types.ts";
import type { DiffClientMessage, DiffServerMessage } from "../shared/diff-types.ts";

type Send = (msg: DiffServerMessage) => void;

const RANGE_KINDS = new Set(["working", "branch", "commit", "range"]);

export function toRange(value: unknown): DiffRange | null {
  if (typeof value !== "object" || value === null) return null;
  const range = value as Record<string, unknown>;
  const kind = range["kind"];
  if (typeof kind !== "string" || !RANGE_KINDS.has(kind)) return null;
  if (kind === "working") return { kind: "working" };
  if (kind === "branch" && typeof range["base"] === "string") return { kind: "branch", base: range["base"] };
  if (kind === "commit" && typeof range["sha"] === "string") return { kind: "commit", sha: range["sha"] };
  if (kind === "range" && typeof range["from"] === "string" && typeof range["to"] === "string") {
    return { kind: "range", from: range["from"], to: range["to"] };
  }
  return null;
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function settle<T>(result: DiffResult<T>, requestId: string, send: Send, onOk: (value: T) => DiffServerMessage): void {
  send(result.ok ? onOk(result.value) : { type: "diff-failed", requestId, message: result.reason });
}

export async function handleDiffMessage(
  msg: DiffClientMessage,
  projectDir: string,
  send: Send,
): Promise<void> {
  const requestId = msg.requestId;
  switch (msg.type) {
    case "diff-refs":
      settle(await readRefs(projectDir), requestId, send, (refs) => ({
        type: "diff-refs-result",
        requestId,
        branch: refs.branch,
        defaultBranch: refs.defaultBranch,
        branches: refs.branches,
      }));
      return;

    case "diff-commits": {
      const limit = typeof msg.limit === "number" && Number.isFinite(msg.limit) ? msg.limit : MAX_COMMITS;
      const base = typeof msg.base === "string" ? msg.base : null;
      settle(await readCommits(projectDir, limit, base), requestId, send, (commits) => ({
        type: "diff-commits-result",
        requestId,
        commits,
      }));
      return;
    }

    case "diff-files": {
      const range = toRange(msg.range);
      if (!range) return send({ type: "diff-failed", requestId, message: "That comparison is not usable." });
      settle(await readStats(projectDir, range), requestId, send, (stats) => ({
        type: "diff-files-result",
        requestId,
        files: stats.files,
        skipped: stats.skipped,
      }));
      return;
    }

    case "diff-patch": {
      const range = toRange(msg.range);
      if (!range) return send({ type: "diff-failed", requestId, message: "That comparison is not usable." });
      settle(await readPatch(projectDir, range, stringList(msg.paths)), requestId, send, (patch) => ({
        type: "diff-patch-result",
        requestId,
        files: patch.files,
        skipped: patch.skipped,
      }));
      return;
    }

    case "diff-context": {
      const { path, rev, from, to } = msg;
      if (typeof path !== "string" || typeof from !== "number" || typeof to !== "number") {
        return send({ type: "diff-failed", requestId, message: "That context request is not usable." });
      }
      settle(await readContextLines(projectDir, path, typeof rev === "string" ? rev : null, from, to), requestId, send, (lines) => ({
        type: "diff-context-result",
        requestId,
        path,
        from,
        lines,
      }));
      return;
    }

    default: {
      const unreachable: never = msg;
      return unreachable;
    }
  }
}
