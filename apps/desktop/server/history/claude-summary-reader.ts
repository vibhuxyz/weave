import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import {
  CLAUDE_PROJECTS_DIR,
  CLAUDE_SESSION_SUFFIX,
  MAX_CLAUDE_SESSION_FILE_BYTES,
} from "./constants.ts";
import { summaryFromClaudeRecord } from "./compact-summary.ts";
import { isSafeSessionId } from "./parse-archive.ts";

const CLAUDE_DIR_NAME = ".claude";
const NON_PATH_CHAR = /[^a-zA-Z0-9]/g;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function claudeProjectsRoot(): string {
  return resolve(process.env.CLAUDE_CONFIG_DIR ?? resolve(homedir(), CLAUDE_DIR_NAME), CLAUDE_PROJECTS_DIR);
}

async function sessionFile(projectDir: string, sessionId: string): Promise<string | null> {
  if (!isSafeSessionId(sessionId)) return null;
  const root = claudeProjectsRoot();
  const candidate = resolve(root, projectDir.replace(NON_PATH_CHAR, "-"), `${sessionId}${CLAUDE_SESSION_SUFFIX}`);
  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(candidate)]);
    if (!realFile.startsWith(`${realRoot}${sep}`)) return null;
    const info = await stat(realFile);
    return info.size <= MAX_CLAUDE_SESSION_FILE_BYTES ? realFile : null;
  } catch (error: unknown) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function readClaudeCompactSummary(projectDir: string, sessionId: string): Promise<string | null> {
  const path = await sessionFile(projectDir, sessionId);
  if (!path) return null;
  const lines = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let latest: string | null = null;
  for await (const line of lines) {
    latest = summaryFromClaudeRecord(line) ?? latest;
  }
  return latest;
}
