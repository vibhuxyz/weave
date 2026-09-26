import { IGNORED_DIRTY_BASENAMES } from "./constants.ts";

const STATUS_LINE = /^[ MADRCU?!]{1,2} (?<entry>\S.*)$/;
const RENAME_SEPARATOR = " -> ";
const QUOTED_PATH = /^"(?<path>.*)"$/;

function unquote(path: string): string {
  return QUOTED_PATH.exec(path)?.groups?.path ?? path;
}

function basename(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1] ?? path;
}

function renameTarget(entry: string): string {
  const separatorAt = entry.lastIndexOf(RENAME_SEPARATOR);
  return separatorAt === -1 ? entry : entry.slice(separatorAt + RENAME_SEPARATOR.length);
}

function isIgnorableEntry(entry: string): boolean {
  return IGNORED_DIRTY_BASENAMES.has(basename(unquote(renameTarget(entry))));
}

export function blockingDirtyLines(lines: readonly string[]): readonly string[] {
  return lines.filter((line) => {
    const entry = STATUS_LINE.exec(line)?.groups?.entry;
    if (entry === undefined) return true;
    return !isIgnorableEntry(entry);
  });
}
