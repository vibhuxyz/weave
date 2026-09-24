import type { CommitSummary } from "../types.ts";

export const LOG_FORMAT = "%x1e%H%x1f%aI%x1f%s";
const MAX_FILES_PER_COMMIT = 50;

export function parseGitLog(output: string): readonly CommitSummary[] {
  return output
    .split("\x1e")
    .map((record) => record.split(/\r?\n/).filter((line) => line.length > 0))
    .flatMap(([header, ...files]) => {
      const [sha, at, subject] = (header ?? "").split("\x1f");
      if (!sha || !at || subject === undefined) return [];
      return [{ sha, at, subject: subject.replace(/\s+/g, " ").trim(), files: files.slice(0, MAX_FILES_PER_COMMIT) }];
    });
}
