import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGitStatus } from "../shared/index.ts";
import { outputLines, runGit } from "../worktree/index.ts";
import type { DeliveryPlan, DeliveryResult } from "./types.ts";

const SHORT_SHA_LENGTH = 8;
const MAX_LISTED_FILES = 10;
const PATHS_PER_GIT_CALL = 200;

function short(sha: string): string {
  return sha.slice(0, SHORT_SHA_LENGTH);
}

function listed(files: readonly string[]): string {
  const more = files.length > MAX_LISTED_FILES ? ` (+${files.length - MAX_LISTED_FILES} more)` : "";
  return `${files.slice(0, MAX_LISTED_FILES).join(", ")}${more}`;
}

async function withPathspec<T>(files: readonly string[], use: (pathspecArgs: readonly string[]) => Promise<T>): Promise<T> {
  const scratch = await mkdtemp(join(tmpdir(), "weave-deliver-"));
  try {
    const pathspec = join(scratch, "pathspec");
    await writeFile(pathspec, files.join("\0"));
    return await use([`--pathspec-from-file=${pathspec}`, "--pathspec-file-nul"]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function checkoutFiles(repoRoot: string, treeish: string, files: readonly string[]): Promise<DeliveryResult | null> {
  if (files.length === 0) return null;
  const checkedOut = await withPathspec(files, (pathspecArgs) => runGit(repoRoot, ["checkout", treeish, ...pathspecArgs]));
  return checkedOut.ok ? null : { ok: false, reason: `Cannot restore ${listed(files)} from ${short(treeish)}: ${checkedOut.output.trim()}` };
}

async function headOf(repoRoot: string): Promise<string | null> {
  const head = await runGit(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]);
  return head.ok ? head.output.trim() : null;
}

export async function acceptRun(repoRoot: string, plan: DeliveryPlan): Promise<DeliveryResult> {
  const { integrationHead } = plan;
  if (integrationHead === null) return { ok: false, reason: `Nothing was merged, so there is nothing to accept: ${plan.detail}` };
  if (plan.integrationStatus === "failed") return { ok: false, reason: `The combined result failed its checks, so it cannot be accepted: ${plan.detail}` };
  const head = await headOf(repoRoot);
  if (head !== plan.baseCommit) {
    return { ok: false, reason: `Your branch moved since the run started (from ${short(plan.baseCommit)} to ${head ? short(head) : "nothing"}). Merge ${short(integrationHead)} yourself instead.` };
  }
  const dirty = new Set((await readGitStatus(repoRoot)).changes.map((change) => change.path));
  const touched = plan.isolatedFiles.filter((path) => dirty.has(path));
  if (touched.length > 0) return { ok: false, reason: `You changed ${listed(touched)} since the run started, and accepting would overwrite them. Commit or stash them, then accept again.` };
  const reset = await runGit(repoRoot, ["reset", "--mixed", "--quiet", integrationHead]);
  if (!reset.ok) return { ok: false, reason: `Cannot move your branch to ${short(integrationHead)}: ${reset.output.trim()}` };
  const restored = await checkoutFiles(repoRoot, integrationHead, plan.isolatedFiles);
  if (restored) return restored;
  const merged = new Set(plan.mergedFiles);
  const leftOver = plan.sharedFiles.filter((path) => !merged.has(path));
  const leftOverNote = leftOver.length > 0 ? ` Left uncommitted, from workers whose work was not merged: ${listed(leftOver)}.` : "";
  return { ok: true, summary: `Accepted: your branch now points at ${short(integrationHead)}, with ${plan.mergedFiles.length} changed file(s) from the run.${leftOverNote}` };
}

type ExistingFiles = { readonly ok: true; readonly files: ReadonlySet<string> } | { readonly ok: false; readonly reason: string };

async function filesAtCommit(repoRoot: string, commit: string, files: readonly string[]): Promise<ExistingFiles> {
  const batches = Array.from({ length: Math.ceil(files.length / PATHS_PER_GIT_CALL) }, (_, index) => files.slice(index * PATHS_PER_GIT_CALL, (index + 1) * PATHS_PER_GIT_CALL));
  const listed = await Promise.all(batches.map((batch) => runGit(repoRoot, ["ls-tree", "-r", "--name-only", commit, "--", ...batch])));
  const failed = listed.find((run) => !run.ok);
  if (failed) return { ok: false, reason: `Cannot tell which files existed at ${short(commit)}, so nothing was changed: ${failed.output.trim()}` };
  return { ok: true, files: new Set(listed.flatMap((run) => outputLines(run.output))) };
}

export async function discardRun(repoRoot: string, plan: DeliveryPlan): Promise<DeliveryResult> {
  const files = plan.sharedFiles;
  const atBase = await filesAtCommit(repoRoot, plan.baseCommit, files);
  if (!atBase.ok) return atBase;
  const existed = atBase.files;
  const restored = await checkoutFiles(repoRoot, plan.baseCommit, files.filter((path) => existed.has(path)));
  if (restored) return restored;
  await Promise.all(files.filter((path) => !existed.has(path)).map((path) => rm(join(repoRoot, path), { force: true })));
  return { ok: true, summary: `Discarded: ${files.length} file(s) are back to how they were before the run. The workers' work is still on the weave/${plan.runId}/ branches.` };
}
