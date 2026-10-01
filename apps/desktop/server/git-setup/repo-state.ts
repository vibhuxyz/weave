import { runGit } from "@weave/core";

export type RepoState = "ready" | "no-repo" | "no-commit";

export async function repoState(projectDir: string): Promise<RepoState> {
  const inside = await runGit(projectDir, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.output.trim() !== "true") return "no-repo";
  const head = await runGit(projectDir, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]);
  return head.ok ? "ready" : "no-commit";
}
