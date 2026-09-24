import { runGit } from "../../worktree/index.ts";
import { RECENT_COMMIT_COUNT } from "../constants.ts";
import type { CommitSummary, RepositoryInfo } from "../types.ts";
import { LOG_FORMAT, parseGitLog } from "./parse-log.ts";

export interface GitFacts {
  readonly repository: RepositoryInfo;
  readonly recentChanges: readonly CommitSummary[];
}

function firstLine(output: string): string | null {
  return output.split(/\r?\n/)[0]?.trim() || null;
}

export async function readGitFacts(root: string): Promise<GitFacts> {
  const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok) return { repository: { root, isGitRepo: false, branch: null, head: null }, recentChanges: [] };
  const [branch, head, log] = await Promise.all([
    runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(root, ["rev-parse", "HEAD"]),
    runGit(root, ["-c", "core.quotepath=off", "log", `-n${RECENT_COMMIT_COUNT}`, "--name-only", `--format=${LOG_FORMAT}`]),
  ]);
  return {
    repository: { root, isGitRepo: true, branch: branch.ok ? firstLine(branch.output) : null, head: head.ok ? firstLine(head.output) : null },
    recentChanges: log.ok ? parseGitLog(log.output) : [],
  };
}
