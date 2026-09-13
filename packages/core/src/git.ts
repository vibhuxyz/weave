import { spawn } from "node:child_process";

export interface GitChange {
  path: string;
  /** Two-character porcelain code, e.g. " M", "A ", "??". */
  code: string;
}

export interface GitStatus {
  /** null when the directory is not a git repo. */
  branch: string | null;
  changes: GitChange[];
}

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((done) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", () => done(null));
    child.on("close", (code) => done(code === 0 ? out : null));
  });
}

export async function readGitStatus(cwd: string): Promise<GitStatus> {
  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]))?.trim();
  if (!branch) return { branch: null, changes: [] };

  const porcelain = (await git(cwd, ["status", "--porcelain"])) ?? "";
  const changes = porcelain
    .split("\n")
    .filter((line) => line.length > 3)
    // Porcelain is fixed-width: 2 status chars, a space, then the path.
    .map((line) => ({ code: line.slice(0, 2), path: line.slice(3) }));

  return { branch, changes };
}

/** The current commit sha, or null when there is no `HEAD` yet (empty repo)
 * or `cwd` is not a git repo. Used to fill `TaskState.git.headCommit` in the
 * Stop sequence (CONTINUATION.md §8 step 3) — a separate call from
 * `readGitStatus` because most callers of that one never need the sha. */
export async function readHeadCommit(cwd: string): Promise<string | null> {
  const sha = (await git(cwd, ["rev-parse", "HEAD"]))?.trim();
  return sha || null;
}
