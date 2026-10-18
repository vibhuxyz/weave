import { MAX_COMMITS, SHORT_SHA_LENGTH } from "../constants.ts";
import { gitText } from "./run-git-stdout.ts";
import type { Commit, DiffResult } from "../types.ts";

const UNIT = "\u001f";
const LOG_FORMAT = ["%H", "%h", "%s", "%an", "%aI"].join(UNIT);

function toCommit(record: string): Commit | null {
  const fields = record.split(UNIT);
  const sha = fields[0]?.trim();
  if (!sha) return null;
  return {
    sha,
    shortSha: fields[1]?.trim() || sha.slice(0, SHORT_SHA_LENGTH),
    subject: fields[2] ?? "",
    author: fields[3] ?? "",
    committedAt: fields[4] ?? "",
  };
}

export async function readCommits(cwd: string, limit: number, base: string | null): Promise<DiffResult<readonly Commit[]>> {
  const capped = Math.max(1, Math.min(limit, MAX_COMMITS));
  const scope = base ? [`${base}..HEAD`] : [];
  const log = await gitText(cwd, ["log", "-z", `-n${String(capped)}`, `--format=${LOG_FORMAT}`, ...scope]);
  if (!log.ok) return log;
  const commits = log.value.split("\0").flatMap((record) => {
    const commit = toCommit(record);
    return commit ? [commit] : [];
  });
  return { ok: true, value: commits };
}
