import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { Coordinator } from "../coordination/index.ts";
import { PhaseTracker } from "../dag/index.ts";
import type { TaskPhase } from "../dag/index.ts";
import { runPool, type RunWorker } from "../pool/index.ts";
import { Ledger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-parallel-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  for (const area of ["backend", "frontend", "tests"]) {
    await mkdir(join(repo, area), { recursive: true });
    await writeFile(join(repo, area, "index.ts"), `export const ${area} = 1;\n`);
  }
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const TASKS: readonly TaskContract[] = [
  { id: "W1", prompt: "backend", cwd: "", allowedPaths: ["backend/**"], produces: ["ApiContract"] },
  { id: "W2", prompt: "frontend", cwd: "", allowedPaths: ["frontend/**"] },
  {
    id: "W3",
    prompt: "tests",
    cwd: "",
    allowedPaths: ["tests/**"],
    dependencies: [{ task: "W1", requiredOutputs: ["ApiContract"] }],
  },
];

function deferred() {
  let open = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { gate, open: () => open() };
}

test("W3 is partially blocked on W1's artifact while W1 and W2 keep running", async () => {
  const repo = await makeRepo();
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const coordinator = new Coordinator({ tasks: TASKS, ledger });

  const tracker = new PhaseTracker({ tasks: TASKS });
  const stopTracking = tracker.watch(ledger);

  const allRunning = deferred();
  const artifactSeen = deferred();
  const snapshots: Record<string, TaskPhase | null>[] = [];
  let started = 0;

  const worker: RunWorker = async ({ task, coordination }) => {
    started += 1;
    if (started === TASKS.length) allRunning.open();
    await allRunning.gate;

    if (task.id === "W1") {
      snapshots.push({ W1: tracker.phaseOf("W1"), W2: tracker.phaseOf("W2"), W3: tracker.phaseOf("W3") });
      const published = coordination.publish({
        type: "artifact.ready",
        data: {
          artifact: {
            name: "ApiContract",
            summary: "the shape of the orders API",
            provides: ["ApiContract"],
            files: [{ path: "backend/contract.md", content: "# orders\n" }],
          },
        },
      });
      assert.ok(published.ok, "W1 must be able to publish its artifact");
      artifactSeen.open();
    }

    if (task.id === "W3") {
      await artifactSeen.gate;
      const inbox = coordination.drain();
      assert.ok(inbox.events.length > 0, "W3 must receive the artifact it waited for");
      snapshots.push({ W1: tracker.phaseOf("W1"), W2: tracker.phaseOf("W2"), W3: tracker.phaseOf("W3") });
    }

    await writeFile(join(task.cwd, task.allowedPaths?.[0]?.replace("/**", "") ?? ".", "done.ts"), "export const done = 1;\n");
    return { status: "ok" };
  };

  const report = await runPool({
    repoRoot: repo,
    weaveDir,
    ledger,
    tasks: TASKS,
    concurrency: 3,
    runWorker: worker,
    shouldInstall: false,
    coordinator,
  });
  stopTracking();

  assert.equal(started, 3, "all three workers must start, W3 included");

  const beforeArtifact = snapshots[0];
  assert.deepEqual(beforeArtifact, { W1: "running", W2: "running", W3: "partially-blocked" });

  const afterArtifact = snapshots[1];
  assert.equal(afterArtifact?.W3, "running", "W3 must resume once the artifact is ready");
  assert.equal(afterArtifact?.W2, "running", "W2 must never have stopped");

  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status]), [
    ["W1", "ok"],
    ["W2", "ok"],
    ["W3", "ok"],
  ]);
});

test("a worker that asks for more context is granted it, and the extra context is delivered", async () => {
  const repo = await makeRepo();
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run2");
  const tasks: readonly TaskContract[] = [
    { id: "T1", prompt: "payments", cwd: "", allowedPaths: ["services/payment/**"] },
  ];
  const asked: string[][] = [];
  const coordinator = new Coordinator({
    tasks,
    ledger,
    contextFor: (paths) => {
      asked.push([...paths]);
      return `billing context for ${paths.join(", ")}`;
    },
  });

  const channel = coordinator.channelFor("T1");
  const result = channel.publish({
    type: "scope.expand",
    data: { paths: ["services/billing/**"], reason: "payment writes go through billing" },
  });
  assert.ok(result.ok);

  assert.deepEqual(coordinator.expansions(), [
    { taskId: "T1", paths: ["services/billing/**"], reason: "payment writes go through billing" },
  ]);
  assert.deepEqual(asked, [["services/billing/**"]]);

  const widened = coordinator.tasks().find((task) => task.id === "T1");
  assert.deepEqual(widened?.allowedPaths, ["services/billing/**", "services/payment/**"]);

  const inbox = channel.drain();
  const granted = inbox.events.find((event) => event.type === "scope.granted");
  assert.ok(granted, "the worker must be told its scope was widened");
  assert.equal(granted.type === "scope.granted" ? granted.data.context : "", "billing context for services/billing/**");
});

test("an expansion into another worker's paths is denied and the scope is unchanged", async () => {
  const repo = await makeRepo();
  const ledger = new Ledger(join(repo, ".weave"), "run3");
  const tasks: readonly TaskContract[] = [
    { id: "T1", prompt: "payments", cwd: "", allowedPaths: ["services/payment/**"] },
    { id: "T2", prompt: "billing", cwd: "", allowedPaths: ["services/billing/**"] },
  ];
  const coordinator = new Coordinator({ tasks, ledger });
  assert.ok(coordinator.tryClaim(tasks[1] as TaskContract));

  const channel = coordinator.channelFor("T1");
  channel.publish({ type: "scope.expand", data: { paths: ["services/billing/**"], reason: "I need it too" } });

  assert.deepEqual(coordinator.expansions(), []);
  const unchanged = coordinator.tasks().find((task) => task.id === "T1");
  assert.deepEqual(unchanged?.allowedPaths, ["services/payment/**"]);

  const denied = channel.drain().events.find((event) => event.type === "scope.denied");
  assert.ok(denied, "the worker must be told why it was refused");
  assert.match(denied.type === "scope.denied" ? denied.data.reason : "", /held by T2/);
});

test("an expansion that escapes the project is refused", async () => {
  const repo = await makeRepo();
  const ledger = new Ledger(join(repo, ".weave"), "run4");
  const tasks: readonly TaskContract[] = [{ id: "T1", prompt: "payments", cwd: "", allowedPaths: ["services/payment/**"] }];
  const coordinator = new Coordinator({ tasks, ledger });
  const channel = coordinator.channelFor("T1");

  channel.publish({ type: "scope.expand", data: { paths: ["../../etc/passwd"], reason: "curiosity" } });
  assert.deepEqual(coordinator.expansions(), []);
  const denied = channel.drain().events.find((event) => event.type === "scope.denied");
  assert.ok(denied);
  assert.match(denied.type === "scope.denied" ? denied.data.reason : "", /must not escape the project/);
});
