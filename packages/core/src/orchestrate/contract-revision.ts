import type { TaskContract, TaskStatus } from "@weave/protocol";
import {
  assessContractChange,
  buildContractDelta,
  buildContractEditPrompt,
  CONTRACT_GLOB,
  extractContractChangeRequest,
  type Contract,
  type ContractChangeRequest,
} from "../contracts/index.ts";
import type { PlannedTask } from "../planner/index.ts";
import { runPool, type PoolReport, type RunWorker, type SettledStatus } from "../pool/index.ts";
import type { Reviser } from "../run-plan/index.ts";
import type { Ledger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";

const FIRST_CONTRACT_VERSION = 1;

export interface ContractReviserInput {
  readonly tasks: readonly PlannedTask[];
  readonly contract: Pick<Contract, "exports" | "entryPath">;
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly runWorker: RunWorker;
}

interface FoundRequest {
  readonly requesterId: string;
  readonly request: ContractChangeRequest;
}

function findRequest(pool: PoolReport, freshTaskIds: ReadonlySet<string>, ledger: Ledger): FoundRequest | null {
  const found: FoundRequest[] = [];
  for (const entry of pool.tasks) {
    if (!freshTaskIds.has(entry.taskId) || !entry.finalMessage) continue;
    const parsed = extractContractChangeRequest(entry.finalMessage);
    if (!parsed) continue;
    if (!parsed.ok) ledger.append("contract.change.rejected", { requestedBy: entry.taskId, reason: `invalid request: ${parsed.issues.join("; ")}` });
    else found.push({ requesterId: entry.taskId, request: parsed.request });
  }
  for (const later of found.slice(1)) {
    ledger.append("contract.change.rejected", { requestedBy: later.requesterId, reason: `one contract change per round; ${found[0]?.requesterId} was applied first` });
  }
  return found[0] ?? null;
}

async function applyChange(input: ContractReviserInput, found: FoundRequest, baseCommit: string, nextVersion: number): Promise<{ commit: string } | { reason: string }> {
  const editor: TaskContract = {
    id: `contract-v${nextVersion}`,
    cwd: input.repoRoot,
    prompt: buildContractEditPrompt(found.request, input.contract, nextVersion),
    allowedPaths: [CONTRACT_GLOB],
  };
  const { repoRoot, weaveDir, ledger, runWorker } = input;
  const report = await runPool({ tasks: [editor], repoRoot, weaveDir, ledger, runWorker, baseCommit, concurrency: 1, shouldInstall: false });
  const entry = report.tasks[0];
  const commit = entry?.harvest?.commit;
  if (entry?.status !== "ok" || !commit) return { reason: `contract editor ${entry?.status ?? "missing"}: ${entry?.reason ?? "no change committed"}` };
  const entryFile = await runGit(repoRoot, ["show", `${commit}:${input.contract.entryPath}`]);
  if (!new RegExp(`CONTRACT_VERSION\\s*=\\s*${nextVersion}\\b`).test(entryFile.output)) {
    return { reason: `the edited contract does not set CONTRACT_VERSION = ${nextVersion}` };
  }
  return { commit };
}

function toTaskStatus(status: SettledStatus): TaskStatus {
  return status === "skipped" ? "cancelled" : status;
}

export function contractReviser(input: ContractReviserInput): Reviser {
  return async ({ pool, baseCommit, round, freshTaskIds }) => {
    const found = findRequest(pool, freshTaskIds, input.ledger);
    if (!found) return null;
    const nextVersion = FIRST_CONTRACT_VERSION + round;
    const applied = await applyChange(input, found, baseCommit, nextVersion);
    if ("reason" in applied) {
      input.ledger.append("contract.change.rejected", { requestedBy: found.requesterId, reason: applied.reason });
      return null;
    }
    const statuses = new Map(pool.tasks.map((entry) => [entry.taskId, toTaskStatus(entry.status)]));
    const impact = assessContractChange({ request: found.request, requesterId: found.requesterId, tasks: input.tasks, statuses });
    const rerunIds = new Set([...impact.rerun, found.requesterId]);
    const delta = buildContractDelta(found.request, { version: nextVersion, entryPath: input.contract.entryPath });
    const rerun = input.tasks.filter((task) => rerunIds.has(task.id)).map((task) => ({ ...task, prompt: `${task.prompt}\n\n${delta}` }));
    input.ledger.append("contract.changed", {
      version: nextVersion,
      requestedBy: found.requesterId,
      affects: [...found.request.affects],
      rerun: rerun.map((task) => task.id),
      commit: applied.commit,
    });
    return { baseCommit: applied.commit, rerun };
  };
}
