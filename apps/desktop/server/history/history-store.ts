import type { ArchivesRepo } from "../storage/index.ts";
import { MAX_HISTORY_BYTES } from "./constants.ts";
import { isSafeSessionId, parseArchive } from "./parse-archive.ts";
import type { HistoryArchive, ParseResult } from "./types.ts";

export interface HistoryStoreOptions {
  readonly archives: ArchivesRepo;
  readonly projectId: string;
  readonly now: () => number;
}

export class HistoryStore {
  private readonly options: HistoryStoreOptions;

  constructor(options: HistoryStoreOptions) {
    this.options = options;
  }

  load(sessionId: string): ParseResult<HistoryArchive | null> {
    if (!isSafeSessionId(sessionId)) return { ok: false, reason: `Cannot load history for invalid session id ${sessionId}` };
    const raw = this.options.archives.load(this.options.projectId, sessionId);
    if (raw === null) return { ok: true, value: null };
    const bytes = Buffer.byteLength(raw, "utf8");
    if (bytes > MAX_HISTORY_BYTES) {
      return { ok: false, reason: `Saved history for ${sessionId} is ${bytes} bytes, over the ${MAX_HISTORY_BYTES} byte limit` };
    }
    try {
      const parsed = parseArchive(JSON.parse(raw));
      if (!parsed.ok) return { ok: false, reason: `Cannot read saved history for ${sessionId}: ${parsed.reason}` };
      return { ok: true, value: parsed.value };
    } catch (error: unknown) {
      if (error instanceof SyntaxError) return { ok: false, reason: `Saved history for ${sessionId} is not valid JSON` };
      throw error;
    }
  }

  save(archive: HistoryArchive): ParseResult<null> {
    if (!isSafeSessionId(archive.sessionId)) {
      return { ok: false, reason: `Cannot save history for invalid session id ${archive.sessionId}` };
    }
    const body = JSON.stringify(archive);
    const bytes = Buffer.byteLength(body, "utf8");
    if (bytes > MAX_HISTORY_BYTES) {
      return { ok: false, reason: `History for ${archive.sessionId} is ${bytes} bytes, over the ${MAX_HISTORY_BYTES} byte limit` };
    }
    return this.options.archives.save(this.options.projectId, archive.sessionId, body, this.options.now());
  }
}
