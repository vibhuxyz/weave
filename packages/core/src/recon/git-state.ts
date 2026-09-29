import { readGitRemote, readGitStatus, readHeadCommit, readRecentCommits } from "../shared/index.ts";
import { MAX_UNCOMMITTED_PATHS } from "./constants.ts";
import type { ReconGitState } from "./types.ts";

export async function readReconGitState(root: string, commitLimit: number): Promise<ReconGitState> {
  const status = await readGitStatus(root);
  if (status.branch === null) {
    return {
      isGitRepo: false,
      branch: null,
      head: null,
      remote: null,
      clean: true,
      uncommitted: [],
      recentCommits: [],
    };
  }

  const [head, remote, recentCommits] = await Promise.all([
    readHeadCommit(root),
    readGitRemote(root),
    readRecentCommits(root, commitLimit),
  ]);

  return {
    isGitRepo: true,
    branch: status.branch,
    head,
    remote,
    clean: status.changes.length === 0,
    uncommitted: status.changes
      .map((change) => change.path)
      .sort()
      .slice(0, MAX_UNCOMMITTED_PATHS),
    recentCommits,
  };
}
