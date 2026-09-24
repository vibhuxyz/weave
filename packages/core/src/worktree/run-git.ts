import { spawn } from "node:child_process";

const MAX_GIT_OUTPUT_CHARS = 1_000_000;

export interface GitRun {
  readonly ok: boolean;
  readonly output: string;
}

export function runGit(cwd: string, args: readonly string[]): Promise<GitRun> {
  return new Promise((done) => {
    const child = spawn("git", [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: string[] = [];
    let size = 0;
    const collect = (chunk: Buffer) => {
      if (size >= MAX_GIT_OUTPUT_CHARS) return;
      const text = chunk.toString();
      chunks.push(text);
      size += text.length;
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => done({ ok: false, output: `git ${args.join(" ")}: ${error.message}` }));
    child.on("close", (code) => done({ ok: code === 0, output: chunks.join("").slice(0, MAX_GIT_OUTPUT_CHARS) }));
  });
}

export function outputLines(output: string): readonly string[] {
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}
