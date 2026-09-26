import { runGit } from "@weave/core";

export type RepoState = "ready" | "no-repo" | "no-commit";

export async function repoState(projectDir: string): Promise<RepoState> {
  const inside = await runGit(projectDir, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.output.trim() !== "true") return "no-repo";
  const head = await runGit(projectDir, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  return head.ok ? "ready" : "no-commit";
}

export function needsGitReason(state: Exclude<RepoState, "ready">, projectDir: string): string {
  return state === "no-repo"
    ? `${projectDir} is not a git repository. Parallel workers each branch from the last commit, so Weave needs one.`
    : `${projectDir} has no commits yet. Parallel workers each branch from the last commit, so Weave needs one.`;
}
