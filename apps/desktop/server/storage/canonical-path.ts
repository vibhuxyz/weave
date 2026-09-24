import { realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { StorageResult } from "./types.ts";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

export async function canonicalProjectPath(input: string): Promise<StorageResult<string>> {
  if (!isAbsolute(input)) return { ok: false, reason: `Project folder ${input} is not an absolute path` };
  try {
    const canonical = await realpath(resolve(input));
    if (!(await stat(canonical)).isDirectory()) return { ok: false, reason: `Project path ${input} is not a folder` };
    return { ok: true, value: canonical };
  } catch (error: unknown) {
    if (isMissing(error)) return { ok: false, reason: `Project folder ${input} does not exist` };
    throw error;
  }
}
