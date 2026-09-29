import type { TaskContract } from "@weave/protocol";
import { claimsForTask, OwnershipRegistry, type ClaimConflict } from "../coordination/index.ts";
import { readGitStatus, readHeadCommit } from "../shared/index.ts";
import { scopeViolations } from "../pool/index.ts";
import { createRunBranch, currentBranchOf, restoreBranch } from "./branch.ts";
import { DEFAULT_WATCH_INTERVAL_MS } from "./constants.ts";
import { PathLocks } from "./locks.ts";
import type {
  ExternalChange,
  LockHandle,
  OpenWorkspace,
  RunBranch,
  TaskPlacement,
  WorkspaceState,
} from "./types.ts";
import { externalChanges, watchExternalChanges } from "./watcher.ts";

export interface WorkspaceManagerInput {
  readonly repoRoot: string;
  readonly runId: string;
}

export class WorkspaceManager {
  private readonly repoRoot: string;
  private readonly runId: string;
  private readonly ownership = new OwnershipRegistry();
  private readonly locks = new PathLocks();
  private readonly ourPaths = new Set<string>();
  private branch: RunBranch | null = null;
  private baseCommit = "";

  constructor(input: WorkspaceManagerInput) {
    this.repoRoot = input.repoRoot;
    this.runId = input.runId;
  }

  async open(): Promise<OpenWorkspace> {
    const created = await createRunBranch(this.repoRoot, this.runId);
    if (!created.ok) return { ok: false, reason: created.reason };
    this.branch = created.value;
    this.baseCommit = created.value.baseCommit;
    return { ok: true, state: await this.state() };
  }

  async state(): Promise<WorkspaceState> {
    const status = await readGitStatus(this.repoRoot);
    return {
      root: this.repoRoot,
      currentBranch: await currentBranchOf(this.repoRoot),
      runBranch: this.branch?.name ?? null,
      baseCommit: this.baseCommit,
      isClean: status.changes.length === 0,
    };
  }

  place(task: TaskContract): TaskPlacement {
    const claim = this.ownership.claim(task.id, claimsForTask(task));
    if (claim.ok) return { taskId: task.id, placement: "shared", conflicts: [] };
    return {
      taskId: task.id,
      placement: "isolated",
      conflicts: [...new Set(claim.conflicts.map((conflict: ClaimConflict) => conflict.heldBy))].sort(),
    };
  }

  release(taskId: string): void {
    this.ownership.release(taskId);
  }

  lockConflicts(task: Pick<TaskContract, "id" | "allowedPaths">): readonly string[] {
    return this.locks.conflicts(task.id, task.allowedPaths ?? []);
  }

  lock(task: Pick<TaskContract, "id" | "allowedPaths">): Promise<LockHandle> {
    return this.locks.acquire(task.id, task.allowedPaths ?? []);
  }

  mayWrite(task: Pick<TaskContract, "allowedPaths" | "readOnlyPaths">, files: readonly string[]): readonly string[] {
    return scopeViolations(files, task);
  }

  recordOurChanges(paths: Iterable<string>): void {
    for (const path of paths) this.ourPaths.add(path);
  }

  externalChanges(): Promise<readonly ExternalChange[]> {
    return externalChanges(this.repoRoot, (path) => this.ourPaths.has(path));
  }

  watchExternal(
    onChange: (changes: readonly ExternalChange[]) => void,
    intervalMs = DEFAULT_WATCH_INTERVAL_MS,
  ): () => void {
    return watchExternalChanges(this.repoRoot, {
      intervalMs,
      isOurs: (path) => this.ourPaths.has(path),
      onChange,
    });
  }

  checkpoint(): Promise<string | null> {
    return readHeadCommit(this.repoRoot);
  }

  async close(): Promise<void> {
    const previous = this.branch?.previousBranch;
    if (previous) await restoreBranch(this.repoRoot, previous);
  }
}
