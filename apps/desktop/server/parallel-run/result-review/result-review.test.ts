import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGit, type DeliveryPlan, type WorkerResult } from "@weave/core";
import type { ServerMessage } from "../../shared/index.ts";
import { MAX_REVIEW_WORKERS } from "./constants.ts";
import { createPendingResult, reviewOf } from "./index.ts";

const exists = (path: string) => access(path).then(() => true, () => false);

async function repoWithNewFile(): Promise<{ readonly repo: string; readonly base: string }> {
  const repo = await mkdtemp(join(tmpdir(), "weave-result-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, "README.md"), "hi\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  await writeFile(join(repo, "new.ts"), "export const x = 1;\n");
  return { repo, base: (await runGit(repo, ["rev-parse", "HEAD"])).output.trim() };
}

function worker(taskId: string, state: WorkerResult["state"]): WorkerResult {
  return { taskId, state, reason: state === "rejected" ? "conflict in new.ts" : null, ranIn: "shared", branch: `weave/r1/${taskId}`, commit: "c1", files: ["new.ts"], merge: { status: "merged", checks: ["build"], detail: "merged and verified" } };
}

function planFor(base: string, integrationStatus: DeliveryPlan["integrationStatus"]): DeliveryPlan {
  return {
    runId: "r1", baseCommit: base, integrationHead: integrationStatus === "not-merged" ? null : base, integrationStatus, detail: `integration ${integrationStatus}`,
    sharedFiles: ["new.ts"], isolatedFiles: [], mergedFiles: ["new.ts"], workers: [worker("T1", "verified"), worker("T2", "rejected")],
  };
}

const decisionsOf = (sent: readonly ServerMessage[]) =>
  sent.flatMap((message) => (message.type === "run-update" && message.update.kind === "result-decision" ? [message.update.status] : message.type === "error" ? [`error: ${message.message}`] : []));

test("the review shows each worker's result and only lets a merged, unbroken result be accepted", () => {
  const review = reviewOf(planFor("b", "unverified"));
  assert.deepEqual(review.workers, [
    { taskId: "T1", state: "verified", reason: null, fileCount: 1, commit: "c1", checks: ["build"] },
    { taskId: "T2", state: "rejected", reason: "conflict in new.ts", fileCount: 1, commit: "c1", checks: ["build"] },
  ]);
  const statuses: readonly DeliveryPlan["integrationStatus"][] = ["ok", "unverified", "failed", "not-merged"];
  assert.deepEqual(statuses.map((status) => reviewOf(planFor("b", status)).canAccept), [true, true, false, false]);
  const many = { ...planFor("b", "ok"), workers: Array.from({ length: MAX_REVIEW_WORKERS + 3 }, (_, index) => worker(`T${index}`, "completed")) };
  assert.deepEqual([reviewOf(many).workers.length, reviewOf(many).hiddenWorkerCount], [MAX_REVIEW_WORKERS, 3]);
});

test("discarding restores the files once; a second decision on the same run is an error", async () => {
  const { repo, base } = await repoWithNewFile();
  const sent: ServerMessage[] = [];
  const pending = createPendingResult();
  pending.offer({ runKey: "k1", projectDir: repo, plan: planFor(base, "unverified") });
  await pending.decide("k1", "discard", (message) => sent.push(message));
  assert.equal(await exists(join(repo, "new.ts")), false);
  await pending.decide("k1", "accept", (message) => sent.push(message));
  assert.deepEqual(decisionsOf(sent), ["discarded", "error: This run's result was already accepted or discarded."]);
});

test("a refused decision keeps the result open, and two clicks at once deliver it only once", async () => {
  const { repo, base } = await repoWithNewFile();
  const sent: ServerMessage[] = [];
  const pending = createPendingResult();
  pending.offer({ runKey: "k1", projectDir: repo, plan: planFor(base, "failed") });
  await pending.decide("k1", "accept", (message) => sent.push(message));
  await Promise.all([pending.decide("k1", "discard", (message) => sent.push(message)), pending.decide("k1", "discard", (message) => sent.push(message))]);
  assert.deepEqual(decisionsOf(sent).sort(), ["discarded", "error: This run's result was already accepted or discarded.", "refused"]);
});
