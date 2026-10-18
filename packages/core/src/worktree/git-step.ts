import { runGit } from "./run-git.ts";
import type { WorktreeResult } from "./types.ts";

export async function gitStep(repoRoot: string, args: readonly string[], env?: Readonly<Record<string, string>>): Promise<WorktreeResult<string>> {
  const run = await runGit(repoRoot, args, env ? { env } : {});
  return run.ok ? { ok: true, value: run.output.trim() } : { ok: false, reason: `git ${args[0] ?? ""} failed in ${repoRoot}: ${run.output.trim()}` };
}
