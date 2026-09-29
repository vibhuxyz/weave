import { spawn } from "node:child_process";

const PORCELAIN_ENTRY = /^([ MADRCUT?!]{2}) ([\s\S]+)$/;
const RENAMED_OR_COPIED = /[RC]/;

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

  const porcelain = (await git(cwd, ["status", "--porcelain", "-z", "--untracked-files=all"])) ?? "";
  return { branch, changes: parsePorcelainEntries(porcelain) };
}

function parsePorcelainEntries(porcelain: string): GitChange[] {
  const entries = porcelain.split("\0");
  const changes: GitChange[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const match = PORCELAIN_ENTRY.exec(entries[index] ?? "");
    const code = match?.[1];
    const path = match?.[2];
    if (code === undefined || path === undefined) continue;
    changes.push({ code, path });
    if (RENAMED_OR_COPIED.test(code)) index += 1;
  }
  return changes;
}

export async function readHeadCommit(cwd: string): Promise<string | null> {
  const sha = (await git(cwd, ["rev-parse", "HEAD"]))?.trim();
  return sha || null;
}

export async function readGitRemote(cwd: string): Promise<string | null> {
  const url = (await git(cwd, ["remote", "get-url", "origin"]))?.trim();
  return url || null;
}

export interface GitCommit {
  sha: string;
  subject: string;
}

const COMMIT_LINE = /^([0-9a-f]{7,40}) (.*)$/;

export async function readRecentCommits(cwd: string, limit: number): Promise<GitCommit[]> {
  const log = await git(cwd, ["log", `-${limit}`, "--pretty=format:%h %s"]);
  if (!log) return [];
  return log
    .split("\n")
    .map((line) => COMMIT_LINE.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ sha: match[1] ?? "", subject: match[2] ?? "" }));
}
