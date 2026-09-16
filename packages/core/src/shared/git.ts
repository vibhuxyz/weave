import { spawn } from "node:child_process";

const PORCELAIN_STATUS_LENGTH = 2;

export interface GitChange {
  path: string;
  code: string;
}

export interface GitStatus {
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
    .filter((line) => line.length > PORCELAIN_STATUS_LENGTH + 1)
    .map((line) => ({
      code: line.slice(0, PORCELAIN_STATUS_LENGTH),
      path: line.slice(PORCELAIN_STATUS_LENGTH + 1),
    }));

  return { branch, changes };
}

export async function readHeadCommit(cwd: string): Promise<string | null> {
  const sha = (await git(cwd, ["rev-parse", "HEAD"]))?.trim();
  return sha || null;
}
