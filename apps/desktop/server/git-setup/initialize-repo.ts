import { stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isNotFound, runGit } from "@weave/core";
import {
  DEFAULT_GITIGNORE_LINES, FALLBACK_AUTHOR_EMAIL, FALLBACK_AUTHOR_NAME, GITIGNORE_FILE, INITIAL_BRANCH, INITIAL_COMMIT_MESSAGE,
} from "./constants.ts";
import type { RepoState } from "./repo-state.ts";

export type RepoSetup = { readonly ok: true } | { readonly ok: false; readonly reason: string };

function isTooBroad(projectDir: string): boolean {
  const dir = resolve(projectDir);
  return dir === resolve(homedir()) || dirname(dir) === dir;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, (error: unknown) => {
    if (isNotFound(error)) return false;
    throw error;
  });
}

async function git(projectDir: string, args: readonly string[], action: string): Promise<RepoSetup> {
  const run = await runGit(projectDir, args);
  return run.ok ? { ok: true } : { ok: false, reason: `Cannot ${action} in ${projectDir}: ${run.output.trim()}` };
}

async function identityArgs(projectDir: string): Promise<readonly string[]> {
  const [name, email] = await Promise.all([runGit(projectDir, ["config", "user.name"]), runGit(projectDir, ["config", "user.email"])]);
  if (name.ok && email.ok && name.output.trim() && email.output.trim()) return [];
  return ["-c", `user.name=${FALLBACK_AUTHOR_NAME}`, "-c", `user.email=${FALLBACK_AUTHOR_EMAIL}`];
}

export async function initializeRepo(projectDir: string, state: Exclude<RepoState, "ready">): Promise<RepoSetup> {
  if (isTooBroad(projectDir)) return { ok: false, reason: `Weave will not turn ${projectDir} into a git repository; open a project folder instead.` };
  if (state === "no-repo") {
    const init = await git(projectDir, ["init", `--initial-branch=${INITIAL_BRANCH}`], "create a git repository");
    if (!init.ok) return init;
  }
  const gitignore = join(projectDir, GITIGNORE_FILE);
  if (!(await exists(gitignore))) await writeFile(gitignore, `${DEFAULT_GITIGNORE_LINES.join("\n")}\n`);
  const added = await git(projectDir, ["add", "-A"], "stage the project files");
  if (!added.ok) return added;
  return git(projectDir, [...(await identityArgs(projectDir)), "commit", "--allow-empty", "-m", INITIAL_COMMIT_MESSAGE], "make the first commit");
}
