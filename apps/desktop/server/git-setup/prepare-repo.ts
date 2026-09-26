import { initializeRepo } from "./initialize-repo.ts";
import { needsGitReason, repoState } from "./repo-state.ts";

export type RepoCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly needsSetup: true; readonly reason: string }
  | { readonly ok: false; readonly needsSetup: false; readonly reason: string };

export async function prepareRepo(projectDir: string, options: { readonly shouldSetUp: boolean }): Promise<RepoCheck> {
  const state = await repoState(projectDir);
  if (state === "ready") return { ok: true };
  if (!options.shouldSetUp) return { ok: false, needsSetup: true, reason: needsGitReason(state, projectDir) };
  const setup = await initializeRepo(projectDir, state);
  return setup.ok ? { ok: true } : { ok: false, needsSetup: false, reason: setup.reason };
}
