import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { isInside } from "@weave/agent";
import type { DiffResult } from "./types.ts";

const LEADING_DASH = /^-/;

export async function safeRelativePaths(
  cwd: string,
  requested: readonly string[],
): Promise<DiffResult<readonly string[]>> {
  if (requested.length === 0) return { ok: true, value: [] };
  const root = await realpath(cwd);
  const safe: string[] = [];
  for (const path of requested) {
    if (typeof path !== "string" || path.length === 0 || LEADING_DASH.test(path)) {
      return { ok: false, reason: `Not a usable file path: ${String(path)}` };
    }
    if (!isInside(root, resolve(root, path))) {
      return { ok: false, reason: `Cannot read ${path}: it is outside the project.` };
    }
    safe.push(path);
  }
  return { ok: true, value: safe };
}
