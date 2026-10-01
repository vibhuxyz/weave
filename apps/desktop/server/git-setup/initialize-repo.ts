import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isNotFound, outputLines, runGit } from "@weave/core";
import {
  DEFAULT_GITIGNORE_LINES, FALLBACK_AUTHOR_EMAIL, FALLBACK_AUTHOR_NAME, GITIGNORE_FILE, INITIAL_BRANCH, INITIAL_COMMIT_MESSAGE,
} from "./constants.ts";
import type { RepoState } from "./repo-state.ts";

export type RepoSetup = { readonly ok: true; readonly summary: string } | { readonly ok: false; readonly reason: string };
type Step = { readonly ok: true } | { readonly ok: false; readonly reason: string };

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

async function git(projectDir: string, args: readonly string[], action: string): Promise<Step> {
  const run = await runGit(projectDir, args);
  return run.ok ? { ok: true } : { ok: false, reason: `Cannot ${action} in ${projectDir}: ${run.output.trim()}` };
}

async function identityArgs(projectDir: string): Promise<readonly string[]> {
  const [name, email] = await Promise.all([runGit(projectDir, ["config", "user.name"]), runGit(projectDir, ["config", "user.email"])]);
  if (name.ok && email.ok && name.output.trim() && email.output.trim()) return [];
  return ["-c", `user.name=${FALLBACK_AUTHOR_NAME}`, "-c", `user.email=${FALLBACK_AUTHOR_EMAIL}`];
}

async function unignoredDefaults(projectDir: string): Promise<readonly string[]> {
  const checked = await Promise.all(DEFAULT_GITIGNORE_LINES.map(async (line): Promise<string | null> => {
    const name = line.replace(/\/$/, "");
    if (!(await exists(join(projectDir, name)))) return null;
    return (await runGit(projectDir, ["check-ignore", "-q", name])).ok ? null : line;
  }));
  return checked.filter((line): line is string => line !== null);
}

async function ensureGitignore(projectDir: string): Promise<string> {
  const gitignore = join(projectDir, GITIGNORE_FILE);
  if (!(await exists(gitignore))) {
    await writeFile(gitignore, `${DEFAULT_GITIGNORE_LINES.join("\n")}\n`);
    return `added a ${GITIGNORE_FILE} (${DEFAULT_GITIGNORE_LINES.join(", ")})`;
  }
  const missing = await unignoredDefaults(projectDir);
  if (missing.length === 0) return `kept your ${GITIGNORE_FILE}`;
  const current = await readFile(gitignore, "utf8");
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  await appendFile(gitignore, `${separator}${missing.join("\n")}\n`);
  return `added ${missing.join(", ")} to your ${GITIGNORE_FILE} so they are not committed`;
}

export async function initializeRepo(projectDir: string, state: Exclude<RepoState, "ready">): Promise<RepoSetup> {
  if (isTooBroad(projectDir)) return { ok: false, reason: `Weave will not turn ${projectDir} into a git repository; open a project folder instead.` };
  if (state === "no-repo") {
    const init = await git(projectDir, ["init", `--initial-branch=${INITIAL_BRANCH}`], "create a git repository");
    if (!init.ok) return init;
  }
  const ignored = await ensureGitignore(projectDir);
  const added = await git(projectDir, ["add", "-A"], "stage the project files");
  if (!added.ok) return added;
  const staged = await runGit(projectDir, ["diff", "--cached", "--name-only"]);
  const fileCount = staged.ok ? outputLines(staged.output).length : 0;
  const committed = await git(projectDir, [...(await identityArgs(projectDir)), "commit", "--allow-empty", "-m", INITIAL_COMMIT_MESSAGE], "make the first commit");
  if (!committed.ok) return committed;
  const created = state === "no-repo" ? "created a git repository" : "used the existing repository";
  return { ok: true, summary: `Weave set up git here before the run: it ${created}, ${ignored}, and committed ${fileCount} file(s) as "${INITIAL_COMMIT_MESSAGE}". Workers branch from that commit.` };
}
