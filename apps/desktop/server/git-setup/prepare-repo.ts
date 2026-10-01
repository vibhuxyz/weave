import { initializeRepo } from "./initialize-repo.ts";
import { repoState } from "./repo-state.ts";

export type RepoCheck = { readonly ok: true; readonly setupSummary: string | null } | { readonly ok: false; readonly reason: string };

export async function prepareRepo(projectDir: string): Promise<RepoCheck> {
  const state = await repoState(projectDir);
  if (state === "ready") return { ok: true, setupSummary: null };
  const setup = await initializeRepo(projectDir, state);
  return setup.ok ? { ok: true, setupSummary: setup.summary } : { ok: false, reason: setup.reason };
}
