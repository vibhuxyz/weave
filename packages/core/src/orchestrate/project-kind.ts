import type { ProjectKind } from "../planner/index.ts";
import { runGit } from "../worktree/index.ts";

const NON_CODE_FILE = /^(readme|license|licence|changelog|contributing)[^/]*$|\.md$|^\.git(ignore|attributes)$|^\.editorconfig$|^docs\//i;

export async function detectProjectKind(repoRoot: string): Promise<ProjectKind> {
  const listed = await runGit(repoRoot, ["ls-files"]);
  if (!listed.ok) throw new Error(`Cannot list tracked files in ${repoRoot}: ${listed.output.trim()}`);
  const hasCode = listed.output.split(/\r?\n/).some((path) => path.trim().length > 0 && !NON_CODE_FILE.test(path.trim()));
  return hasCode ? "existing" : "greenfield";
}
