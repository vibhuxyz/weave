import { MAX_LANGUAGES } from "../constants.ts";
import type { LanguageUsage, ScannedFile } from "../types.ts";
import { LANGUAGE_BY_EXTENSION } from "./constants.ts";

function extensionOf(path: string): string {
  const name = path.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

export function detectLanguages(files: readonly ScannedFile[]): LanguageUsage[] {
  const totals = new Map<string, { fileCount: number; bytes: number }>();

  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION.get(extensionOf(file.path));
    if (!language) continue;
    const current = totals.get(language) ?? { fileCount: 0, bytes: 0 };
    current.fileCount += 1;
    current.bytes += file.bytes;
    totals.set(language, current);
  }

  return [...totals.entries()]
    .map(([language, usage]) => ({ language, fileCount: usage.fileCount, bytes: usage.bytes }))
    .sort((a, b) => b.bytes - a.bytes || b.fileCount - a.fileCount || a.language.localeCompare(b.language))
    .slice(0, MAX_LANGUAGES);
}
