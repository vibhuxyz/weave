import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isNotFound, isRecord } from "../../shared/index.ts";
import { MAX_MEMORY_FILE_BYTES, MAX_MEMORY_TEXT_CHARS, MEMORY_DIR, MEMORY_KINDS } from "./constants.ts";
import type { MemoryEntry, MemoryKind, MemoryRead } from "./types.ts";

function memoryFile(weaveDir: string, employeeId: string): string {
  return join(weaveDir, MEMORY_DIR, `${employeeId}.ndjson`);
}

function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as readonly string[]).includes(value);
}

function parseEntry(line: string): MemoryEntry | null {
  try {
    const value: unknown = JSON.parse(line);
    if (!isRecord(value) || !isMemoryKind(value["kind"])) return null;
    const { at, runId, taskId, text } = value;
    if (typeof at !== "string" || typeof runId !== "string" || typeof taskId !== "string" || typeof text !== "string") return null;
    return { at, runId, taskId, kind: value["kind"], text: text.slice(0, MAX_MEMORY_TEXT_CHARS) };
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function readMemory(weaveDir: string, employeeId: string): Promise<MemoryRead> {
  const file = memoryFile(weaveDir, employeeId);
  const info = await stat(file).catch((error: unknown) => {
    if (isNotFound(error)) return null;
    throw error;
  });
  if (!info) return { entries: [], skippedLines: 0, issue: null };
  if (info.size > MAX_MEMORY_FILE_BYTES) return { entries: [], skippedLines: 0, issue: `Cannot read memory ${file}: ${info.size} bytes, over ${MAX_MEMORY_FILE_BYTES}` };
  const lines = (await readFile(file, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
  const entries = lines.map(parseEntry);
  const skippedLines = entries.filter((entry) => entry === null).length;
  return { entries: entries.filter((entry): entry is MemoryEntry => entry !== null), skippedLines, issue: skippedLines > 0 ? `${skippedLines} unreadable line(s) in ${file}` : null };
}

export async function appendMemory(weaveDir: string, employeeId: string, entries: readonly MemoryEntry[], maxEntries: number): Promise<void> {
  if (entries.length === 0) return;
  const file = memoryFile(weaveDir, employeeId);
  await mkdir(join(weaveDir, MEMORY_DIR), { recursive: true });
  const existing = await readMemory(weaveDir, employeeId);
  const serialize = (list: readonly MemoryEntry[]): string => list.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  const total = existing.entries.length + entries.length;
  if (total <= maxEntries && existing.issue === null) {
    await appendFile(file, serialize(entries));
    return;
  }
  await writeFile(file, serialize([...existing.entries, ...entries].slice(-maxEntries)));
}
