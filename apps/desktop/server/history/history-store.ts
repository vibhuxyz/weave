import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { weaveDirFor } from "@weave/core";
import { HISTORY_DIR_NAME, HISTORY_FILE_SUFFIX, MAX_HISTORY_BYTES } from "./constants.ts";
import { isSafeSessionId, parseArchive } from "./parse-archive.ts";
import type { HistoryArchive, ParseResult } from "./types.ts";

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

export class HistoryStore {
  private readonly root: string;

  constructor(projectDir: string) {
    this.root = resolve(weaveDirFor(projectDir), HISTORY_DIR_NAME);
  }

  private pathFor(sessionId: string): string | null {
    if (!isSafeSessionId(sessionId)) return null;
    const path = resolve(this.root, `${sessionId}${HISTORY_FILE_SUFFIX}`);
    return path.startsWith(`${this.root}${sep}`) ? path : null;
  }

  async load(sessionId: string): Promise<ParseResult<HistoryArchive | null>> {
    const path = this.pathFor(sessionId);
    if (!path) return { ok: false, reason: `Cannot load history for invalid session id ${sessionId}` };
    try {
      const info = await stat(path);
      if (info.size > MAX_HISTORY_BYTES) {
        return { ok: false, reason: `History file ${path} is ${info.size} bytes, over the ${MAX_HISTORY_BYTES} byte limit` };
      }
      const parsed = parseArchive(JSON.parse(await readFile(path, "utf8")));
      if (!parsed.ok) return { ok: false, reason: `Cannot read history file ${path}: ${parsed.reason}` };
      return { ok: true, value: parsed.value };
    } catch (error: unknown) {
      if (isMissing(error)) return { ok: true, value: null };
      if (error instanceof SyntaxError) return { ok: false, reason: `History file ${path} is not valid JSON` };
      throw error;
    }
  }

  async save(archive: HistoryArchive): Promise<ParseResult<null>> {
    const path = this.pathFor(archive.sessionId);
    if (!path) return { ok: false, reason: `Cannot save history for invalid session id ${archive.sessionId}` };
    const body = JSON.stringify(archive);
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > MAX_HISTORY_BYTES) {
      return { ok: false, reason: `History for ${archive.sessionId} is ${bytes} bytes, over the ${MAX_HISTORY_BYTES} byte limit` };
    }
    await mkdir(this.root, { recursive: true });
    const temporary = join(this.root, `.${archive.sessionId}.${process.pid}.tmp`);
    await writeFile(temporary, body, "utf8");
    await rename(temporary, path);
    return { ok: true, value: null };
  }
}
