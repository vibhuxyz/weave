import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { runPool, type RunWorker } from "../pool/index.ts";
import { Ledger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { createRunBranch, currentBranchOf } from "./branch.ts";
import { PathLocks } from "./locks.ts";
import { WorkspaceManager } from "./manager.ts";
import { externalChanges } from "./watcher.ts";

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-workspace-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  for (const area of ["backend", "frontend", "tests"]) {
    await mkdir(join(repo, area), { recursive: true });
    await writeFile(join(repo, area, `${area}.ts`), `export const ${area} = "before";\n`);
  }
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

function task(id: string, allowedPaths: readonly string[]): TaskContract {
  return { id, prompt: `work on ${id}`, cwd: "", allowedPaths: [...allowedPaths] };
}

test("a clean repository gets a run branch, and the previous branch is restored", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "123" });

  const opened = await manager.open();
  assert.ok(opened.ok);
  assert.equal(opened.state.runBranch, "weave/run-123");
  assert.equal(opened.state.currentBranch, "weave/run-123");
  assert.equal(opened.state.isClean, true);
  assert.equal(await currentBranchOf(repo), "weave/run-123");

  await manager.close();
  assert.equal(await currentBranchOf(repo), "main");
});

test("a dirty repository stops the run instead of stashing or destroying the work", async () => {
  const repo = await makeRepo();
  await writeFile(join(repo, "backend", "backend.ts"), "export const backend = \"mine\";\n");

  const opened = await new WorkspaceManager({ repoRoot: repo, runId: "124" }).open();
  assert.ok(!opened.ok);
  assert.match(opened.reason, /uncommitted change/);
  assert.match(opened.reason, /Commit or stash first/);

  assert.equal(await currentBranchOf(repo), "main", "the branch must not have moved");
  const kept = await readFile(join(repo, "backend", "backend.ts"), "utf8");
  assert.match(kept, /mine/, "the user's edit must survive untouched");
});

test("a run id that is not a safe branch name is refused", async () => {
  const repo = await makeRepo();
  const bad = await createRunBranch(repo, "../evil");
  assert.ok(!bad.ok);
  assert.match(bad.reason, /must be letters, digits/);
});

test("three workers change three real files in the shared project directory while still running", async () => {
  const repo = await makeRepo();
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "shared" });
  assert.ok((await manager.open()).ok);

  const tasks = [
    task("T1", ["backend/**"]),
    task("T2", ["frontend/**"]),
    task("T3", ["tests/**"]),
  ];
  const areaOf: Readonly<Record<string, string>> = { T1: "backend", T2: "frontend", T3: "tests" };

  let arrived = 0;
  let openGate = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  const seenMidRun: string[] = [];

  const worker: RunWorker = async ({ task: running }) => {
    const area = areaOf[running.id] ?? running.id;
    await writeFile(join(running.cwd, area, `${area}.ts`), `export const ${area} = "after";\n`);
    arrived += 1;
    if (arrived === tasks.length) {
      for (const each of ["backend", "frontend", "tests"]) {
        const text = await readFile(join(repo, each, `${each}.ts`), "utf8");
        if (text.includes("after")) seenMidRun.push(each);
      }
      openGate();
    }
    await gate;
    return { status: "ok" };
  };

  const report = await runPool({
    repoRoot: repo,
    weaveDir,
    ledger,
    tasks,
    concurrency: 3,
    runWorker: worker,
    shouldInstall: false,
  });

  assert.deepEqual(report.tasks.map((entry) => entry.status), ["ok", "ok", "ok"]);
  assert.deepEqual(seenMidRun.sort(), ["backend", "frontend", "tests"], "all three edits must be visible mid-run");
  assert.equal(existsSync(join(weaveDir, "worktrees")), false, "disjoint tasks must share the real directory");
  await manager.close();
});

test("two tasks that want the same path are kept apart, one shared and one isolated", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "conflict" });
  assert.ok((await manager.open()).ok);

  const first = manager.place(task("T1", ["src/payment.ts"]));
  const second = manager.place(task("T2", ["src/payment.ts"]));
  const third = manager.place(task("T3", ["tests/**"]));

  assert.equal(first.placement, "shared");
  assert.equal(second.placement, "isolated", "a second writer of the same file must not share the directory");
  assert.deepEqual(second.conflicts, ["T1"]);
  assert.equal(third.placement, "shared");

  manager.release("T1");
  assert.equal(manager.place(task("T4", ["src/payment.ts"])).placement, "shared");
  await manager.close();
});

test("a worker that writes outside its ownership is reported", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "scope" });
  assert.ok((await manager.open()).ok);

  const owner = { allowedPaths: ["services/payment/**"], readOnlyPaths: ["services/payment/legacy.ts"] };
  assert.deepEqual(manager.mayWrite(owner, ["services/payment/charge.ts"]), []);
  assert.deepEqual(manager.mayWrite(owner, ["components/todo/List.tsx"]), [
    "components/todo/List.tsx is outside allowedPaths",
  ]);
  assert.deepEqual(manager.mayWrite(owner, ["services/payment/legacy.ts"]), [
    'services/payment/legacy.ts is read-only (matches "services/payment/legacy.ts")',
  ]);
  await manager.close();
});

test("overlapping path locks serialize, and disjoint ones run together", async () => {
  const locks = new PathLocks();
  const first = locks.tryAcquire("T1", ["src/payment.ts"]);
  assert.ok(first);
  assert.equal(locks.tryAcquire("T2", ["src/payment.ts"]), null);
  assert.deepEqual(locks.conflicts("T2", ["src/payment.ts"]), ["T1"]);
  assert.ok(locks.tryAcquire("T3", ["src/orders.ts"]), "a disjoint path must not wait");

  const order: string[] = [];
  const queued = locks.acquire("T2", ["src/payment.ts"]).then((handle) => {
    order.push("T2 acquired");
    handle.release();
  });
  order.push("T1 releasing");
  first.release();
  await queued;
  assert.deepEqual(order, ["T1 releasing", "T2 acquired"]);

  const directory = new PathLocks();
  assert.ok(directory.tryAcquire("A", ["src"]));
  assert.equal(directory.tryAcquire("B", ["src/deep/file.ts"]), null, "a directory lock must cover its children");
});

test("a change made outside the run is reported as external", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "watch" });
  assert.ok((await manager.open()).ok);

  await writeFile(join(repo, "backend", "backend.ts"), "export const backend = \"by a worker\";\n");
  manager.recordOurChanges(["backend/backend.ts"]);
  await writeFile(join(repo, "frontend", "frontend.ts"), "export const frontend = \"by the user\";\n");

  const changes = await manager.externalChanges();
  assert.deepEqual(changes.map((change) => change.path), ["frontend/frontend.ts"]);
  assert.deepEqual(await externalChanges(repo, () => true), []);
  await manager.close();
});

test("a checkpoint records the commit the run started from", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "checkpoint" });
  const opened = await manager.open();
  assert.ok(opened.ok);
  assert.equal(await manager.checkpoint(), opened.state.baseCommit);
  await manager.close();
});
