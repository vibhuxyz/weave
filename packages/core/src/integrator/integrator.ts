import { createWorktree, installWorktree, removeWorktree, runGit, type Worktree } from "../worktree/index.ts";
import { describeConflict, mergeBranch } from "./merge.ts";
import type { IntegrateOptions, IntegrationReport, MergeCandidate, MergeReport, VerifyResult } from "./types.ts";

export const INTEGRATION_WORKTREE_ID = "integration";

const UNVERIFIED_DETAIL =
  "verification already fails on the base commit, so no merge can be blamed for a failure; merges were checked for conflicts only";

function report(candidate: MergeCandidate, fields: Omit<MergeReport, "taskId">): MergeReport {
  return { taskId: candidate.taskId, ...fields };
}

async function mergeOne(
  candidate: MergeCandidate,
  worktree: Worktree,
  options: IntegrateOptions & { readonly canVerify: boolean },
): Promise<MergeReport> {
  if (candidate.commit === null) return report(candidate, { status: "empty", commit: null, rungs: [], detail: "task changed no files" });
  const attempt = await mergeBranch(worktree.path, candidate.branch, `weave: merge ${candidate.taskId}`);
  if (attempt.status === "conflict") {
    return report(candidate, { status: "conflict", commit: null, rungs: [], detail: describeConflict(attempt.files) });
  }
  if (attempt.status === "merge-error") return report(candidate, { status: "merge-error", commit: null, rungs: [], detail: attempt.detail });
  if (!options.canVerify) return report(candidate, { status: "merged", commit: attempt.commit, rungs: [], detail: "merged; not verified" });
  const verifyStarted = performance.now();
  const verified = await options.verify(worktree.path, options.baseCommit);
  return report(candidate, {
    verifyMs: Math.round(performance.now() - verifyStarted),
    status: verified.ok ? "merged" : "verify-failed",
    commit: attempt.commit,
    rungs: verified.rungs,
    detail: verified.ok ? "merged and verified" : verified.detail,
  });
}

function isBreaking(merge: MergeReport): boolean {
  return merge.status === "conflict" || merge.status === "merge-error" || merge.status === "verify-failed";
}

function logMerge(options: IntegrateOptions, merge: MergeReport): void {
  if (merge.status === "not-run") return;
  const { taskId, status, commit, detail, verifyMs } = merge;
  options.ledger.append("merge.finished", { taskId, status, commit, rungs: [...merge.rungs], detail, ...(verifyMs === undefined ? {} : { verifyMs }) });
}

async function installIfWanted(options: IntegrateOptions, worktree: Worktree): Promise<void> {
  if (!(options.shouldInstall ?? true)) return;
  const outcome = await installWorktree(worktree.path);
  const isSkipped = outcome.status === "skipped";
  options.ledger.append("worktree.installed", {
    taskId: INTEGRATION_WORKTREE_ID,
    status: outcome.status,
    command: isSkipped ? null : outcome.command,
    durationMs: isSkipped ? 0 : outcome.durationMs,
    detail: isSkipped ? outcome.reason : outcome.outputTail,
  });
}

async function mergeAll(options: IntegrateOptions, worktree: Worktree, baseline: VerifyResult): Promise<readonly MergeReport[]> {
  const merges: MergeReport[] = [];
  let brokenBy: string | null = null;
  for (const candidate of options.candidates) {
    const merge: MergeReport = brokenBy
      ? report(candidate, { status: "not-run", commit: null, rungs: [], detail: `not merged: ${brokenBy} broke the integration first` })
      : await mergeOne(candidate, worktree, { ...options, canVerify: baseline.ok });
    logMerge(options, merge);
    merges.push(merge);
    if (!brokenBy && isBreaking(merge)) brokenBy = candidate.taskId;
  }
  return merges;
}

function summarize(merges: readonly MergeReport[], baseline: VerifyResult): Pick<IntegrationReport, "status" | "brokenBy" | "detail"> {
  const broken = merges.find(isBreaking);
  if (broken) return { status: "failed", brokenBy: broken.taskId, detail: `${broken.taskId}: ${broken.detail}` };
  if (!baseline.ok) return { status: "unverified", brokenBy: null, detail: UNVERIFIED_DETAIL };
  return { status: "ok", brokenBy: null, detail: `all ${merges.length} task(s) merged and verified` };
}

export async function integrate(options: IntegrateOptions): Promise<IntegrationReport> {
  const worktree = await createWorktree({
    repoRoot: options.repoRoot,
    weaveDir: options.weaveDir,
    taskId: INTEGRATION_WORKTREE_ID,
    runId: options.ledger.runId,
    baseRef: options.baseCommit,
  });
  try {
    await installIfWanted(options, worktree);
    const baseline = await options.verify(worktree.path, options.baseCommit);
    const merges = await mergeAll(options, worktree, baseline);
    const head = (await runGit(worktree.path, ["rev-parse", "HEAD"])).output.trim() || null;
    const summary = summarize(merges, baseline);
    options.ledger.append("integration.finished", {
      status: summary.status,
      branch: worktree.branch,
      head: head ?? "",
      brokenBy: summary.brokenBy,
    });
    return { ...summary, branch: worktree.branch, head, baseline, merges };
  } finally {
    await removeWorktree(options.repoRoot, worktree);
  }
}
