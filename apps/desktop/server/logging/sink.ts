import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOG_FILE_NAME, MAX_LOG_FILE_BYTES, ROTATED_LOG_FILE_NAME } from "./constants.ts";
import type { LogLevel, LogSink } from "./types.ts";

export interface FileSink {
  readonly sink: LogSink;
  readonly path: string;
}

export const consoleSink: LogSink = {
  write(line: string, level: LogLevel): void {
    const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  },
};

function errorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !("code" in error)) return null;
  const { code } = error as { code?: unknown };
  return typeof code === "string" ? code : null;
}

function existingBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return 0;
    throw error;
  }
}

function reportSinkFailure(action: string, path: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Log file disabled: could not ${action} ${path}: ${detail}\n`);
}

function rotate(path: string, rotated: string): void {
  try {
    renameSync(path, rotated);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

export function createFileSink(dir: string): FileSink | null {
  const path = join(dir, LOG_FILE_NAME);
  const rotated = join(dir, ROTATED_LOG_FILE_NAME);
  const state = { bytes: 0, enabled: true };

  try {
    mkdirSync(dir, { recursive: true });
    state.bytes = existingBytes(path);
  } catch (error) {
    reportSinkFailure("open", path, error);
    return null;
  }

  return {
    path,
    sink: {
      write(line: string): void {
        if (!state.enabled) return;
        const chunk = `${line}\n`;
        try {
          if (state.bytes >= MAX_LOG_FILE_BYTES) {
            rotate(path, rotated);
            state.bytes = 0;
          }
          appendFileSync(path, chunk);
          state.bytes += Buffer.byteLength(chunk, "utf8");
        } catch (error) {
          state.enabled = false;
          reportSinkFailure("write to", path, error);
        }
      },
    },
  };
}
