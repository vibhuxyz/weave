import { mergeBase } from "./refs.ts";
import { gitText } from "./run-git-stdout.ts";
import type { DiffRange, DiffResult } from "../types.ts";

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,200}$/;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function isSafeRef(ref: string): boolean {
  return SAFE_REF.test(ref) && !ref.includes("..");
}

async function parentOf(cwd: string, sha: string): Promise<string> {
  const parent = await gitText(cwd, ["rev-parse", "--verify", "--quiet", `${sha}^{commit}^`]);
  const found = parent.ok ? (parent.value.split(/\r?\n/)[0]?.trim() ?? "") : "";
  return found || EMPTY_TREE;
}

export async function rangeArgs(cwd: string, range: DiffRange): Promise<DiffResult<readonly string[]>> {
  switch (range.kind) {
    case "working":
      return { ok: true, value: ["HEAD"] };
    case "branch": {
      if (!isSafeRef(range.base)) return { ok: false, reason: `Not a usable branch name: ${range.base}` };
      const base = await mergeBase(cwd, range.base, "HEAD");
      if (!base) return { ok: false, reason: `No common history between HEAD and ${range.base}.` };
      return { ok: true, value: [base] };
    }
    case "commit": {
      if (!isSafeRef(range.sha)) return { ok: false, reason: `Not a usable commit id: ${range.sha}` };
      return { ok: true, value: [await parentOf(cwd, range.sha), range.sha] };
    }
    case "range": {
      if (!isSafeRef(range.from) || !isSafeRef(range.to)) {
        return { ok: false, reason: `Not a usable commit range: ${range.from}..${range.to}` };
      }
      return { ok: true, value: [range.from, range.to] };
    }
    default: {
      const unreachable: never = range;
      return unreachable;
    }
  }
}

export function refForOldSide(range: DiffRange, args: readonly string[]): string {
  return range.kind === "working" ? "HEAD" : (args[0] ?? "HEAD");
}
