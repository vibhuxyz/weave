import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARVEST_AUTHOR_EMAIL, HARVEST_AUTHOR_NAME, HARVEST_EXCLUDED_PATHS, MAX_LISTED_DIRTY_PATHS, MAX_SNAPSHOT_FILES, SNAPSHOT_MESSAGE } from "./constants.ts";
import { gitStep } from "./git-step.ts";
import { checkCleanBase } from "./preflight.ts";
import type { WorktreeResult } from "./types.ts";
import { outputLines, runGit } from "./run-git.ts";

export interface RunSnapshot {
  readonly commit: string;
  readonly headCommit: string;
  readonly fileCount: number;
}

export interface RunBase {
  readonly commit: string;
  readonly snapshot: RunSnapshot | null;
}

const AUTHOR_ARGS = ["-c", `user.name=${HARVEST_AUTHOR_NAME}`, "-c", `user.email=${HARVEST_AUTHOR_EMAIL}`] as const;

function describeFiles(files: readonly string[]): string {
  const more = files.length > MAX_LISTED_DIRTY_PATHS ? ` (+${files.length - MAX_LISTED_DIRTY_PATHS} more)` : "";
  return `${files.slice(0, MAX_LISTED_DIRTY_PATHS).join(", ")}${more}`;
}

async function snapshotOf(repoRoot: string, headCommit: string, scratch: string): Promise<WorktreeResult<RunSnapshot>> {
  const env = { GIT_INDEX_FILE: join(scratch, "index") };
  const steps: readonly (readonly string[])[] = [
    ["read-tree", headCommit],
    ["add", "-A", "--", "."],
    ["reset", "--quiet", "--", ...HARVEST_EXCLUDED_PATHS],
  ];
  for (const args of steps) {
    const done = await gitStep(repoRoot, args, env);
    if (!done.ok) return done;
  }
  const changed = await gitStep(repoRoot, ["diff", "--cached", "--name-only", headCommit], env);
  if (!changed.ok) return changed;
  const files = outputLines(changed.value);
  if (files.length > MAX_SNAPSHOT_FILES) {
    return { ok: false, reason: `${repoRoot} has ${files.length} uncommitted files, more than the ${MAX_SNAPSHOT_FILES} Weave can snapshot: ${describeFiles(files)}. Commit or stash first.` };
  }
  const tree = await gitStep(repoRoot, ["write-tree"], env);
  if (!tree.ok) return tree;
  const commit = await gitStep(repoRoot, [...AUTHOR_ARGS, "commit-tree", tree.value, "-p", headCommit, "-m", SNAPSHOT_MESSAGE]);
  return commit.ok ? { ok: true, value: { commit: commit.value, headCommit, fileCount: files.length } } : commit;
}

export async function resolveRunBase(repoRoot: string): Promise<WorktreeResult<RunBase>> {
  const clean = await checkCleanBase(repoRoot);
  if (clean.ok) return { ok: true, value: { commit: clean.value, snapshot: null } };
  const head = await runGit(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!head.ok) return clean;
  const scratch = await mkdtemp(join(tmpdir(), "weave-base-"));
  try {
    const snapshot = await snapshotOf(repoRoot, head.output.trim(), scratch);
    return snapshot.ok ? { ok: true, value: { commit: snapshot.value.commit, snapshot: snapshot.value } } : snapshot;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
