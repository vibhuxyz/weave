import type { VerificationRung } from "@weave/protocol";
import { createWorktree, installWorktree, removeWorktree, runGit, type Worktree } from "../worktree/index.ts";
import { mergeBranch, readHead } from "./merge.ts";
import { settleConflict, settledAttempt } from "./settle-conflict.ts";
import type { IntegrateOptions, IntegrationReport, MergeCandidate, MergeReport, VerifyResult } from "./types.ts";

export const INTEGRATION_WORKTREE_ID = "integration";

const CURRENT_HEAD = "HEAD";

const UNVERIFIED_DETAIL =
  "verification already fails on the base commit, so no merge can be blamed for a failure; merges were checked for conflicts only";
const STRUCTURAL_ONLY_DETAIL =
  "merged, but this project has no lint, typecheck, test or build command, so only a structural check ran; the result is unverified";
const STRUCTURAL_RUNG = "diff-review";

function isStructuralOnly(merges: readonly MergeReport[]): boolean {
  return merges.every((merge) => merge.rungs.every((rung) => rung === STRUCTURAL_RUNG));
}

export function realChecksOf(rungs: readonly VerificationRung[]): readonly VerificationRung[] {
  return rungs.filter((rung) => rung !== STRUCTURAL_RUNG);
}

function report(candidate: MergeCandidate, fields: Omit<MergeReport, "taskId">): MergeReport {
  return { taskId: candidate.taskId, ...fields };
}

async function mergeOne(
  candidate: MergeCandidate,
  worktree: Worktree,
  options: IntegrateOptions & { readonly canVerify: boolean },
): Promise<MergeReport> {
  if (candidate.commit === null) return report(candidate, { status: "empty", commit: null, rungs: [], detail: "task changed no files" });
  const head = (await readHead(worktree.path)) ?? CURRENT_HEAD;
  const attempt = await mergeBranch(worktree.path, candidate.branch, `weave: merge ${candidate.taskId}`);
  const merged = attempt.status === "conflict"
    ? await settleConflict({ cwd: worktree.path, head, candidate, files: attempt.files, resolve: options.resolveConflict })
    : settledAttempt(attempt);
  if (merged.status !== "merged") return report(candidate, { status: merged.status, commit: null, rungs: [], detail: merged.detail });
  const note = merged.note ? `${merged.note}; ` : "";
  if (!options.canVerify) return report(candidate, { status: "merged", commit: merged.commit, rungs: [], detail: `${note}merged; not verified` });
  const verifyStarted = performance.now();
  const verified = await options.verify(worktree.path, options.baseCommit);
  return report(candidate, {
    verifyMs: Math.round(performance.now() - verifyStarted),
    status: verified.ok ? "merged" : "verify-failed",
    commit: merged.commit,
    rungs: verified.rungs,
    detail: verified.ok ? `${note}merged and verified` : `${note}${verified.detail}`,
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
  if (isStructuralOnly(merges)) return { status: "unverified", brokenBy: null, detail: STRUCTURAL_ONLY_DETAIL };
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
