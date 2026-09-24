import type { SessionsRepo, SettingsRepo, StorageResult } from "../storage/index.ts";
import { AUTO_ARCHIVE_DAY_OPTIONS, AUTO_ARCHIVE_SETTING_KEY, MS_PER_DAY } from "./constants.ts";
import type { AutoArchiveDays } from "./types.ts";

const NEVER = "never";

export function parseAutoArchiveDays(raw: unknown): AutoArchiveDays | null | undefined {
  if (raw === null || raw === NEVER) return null;
  const days = typeof raw === "string" ? Number(raw) : raw;
  return AUTO_ARCHIVE_DAY_OPTIONS.find((option) => option === days);
}

export interface AutoArchiveOptions {
  readonly settings: SettingsRepo;
  readonly sessions: SessionsRepo;
  readonly now: () => number;
}

export class AutoArchive {
  private readonly options: AutoArchiveOptions;

  constructor(options: AutoArchiveOptions) {
    this.options = options;
  }

  afterDays(): AutoArchiveDays | null {
    return parseAutoArchiveDays(this.options.settings.get(AUTO_ARCHIVE_SETTING_KEY)) ?? null;
  }

  setAfterDays(days: AutoArchiveDays | null): void {
    this.options.settings.set(AUTO_ARCHIVE_SETTING_KEY, days === null ? NEVER : String(days), this.options.now());
  }

  run(keepSessionId: string | null): StorageResult<number> {
    const days = this.afterDays();
    if (days === null) return { ok: true, value: 0 };
    const nowMs = this.options.now();
    return this.options.sessions.archiveInactive(nowMs - days * MS_PER_DAY, keepSessionId, nowMs);
  }
}
