import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { readLedger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { planAndRun } from "./plan-and-run.ts";
import type { TurnRunner } from "./types.ts";

const ENTRY = "packages/contracts/src/index.js";
const REQUEST = '```json\n{ "contractChangeRequest": { "from": "Note has id only", "to": "Note.title: string", "reason": "the page shows titles", "affects": ["Note"] } }\n```';

async function greenfieldRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-revision-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "README.md"), "# notes\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const fenced = (value: unknown) => `\`\`\`json\n${JSON.stringify(value)}\n\`\`\``;
const BLUEPRINT = {
  stack: "Node.js",
  components: [{ name: "api", responsibility: "HTTP", paths: ["api/**"] }, { name: "frontend", responsibility: "UI", paths: ["web/**"] }, { name: "worker", responsibility: "jobs", paths: ["jobs/**"] }],
  schemas: [{ name: "Note", fields: [{ name: "id", type: "string" }] }, { name: "Job", fields: [{ name: "id", type: "string" }] }],
  endpoints: [{ id: "listNotes", method: "GET", path: "/notes", summary: "list", response: "Note" }],
  events: [],
  smokeFlow: ["GET /notes -> 200"],
};
const PLAN = {
  tasks: [
    { id: "API", title: "api", prompt: "serve notes", allowedPaths: ["api/**"], component: "api", contractSymbols: ["Note"] },
    { id: "WEB", title: "web", prompt: "list notes", allowedPaths: ["web/**"], component: "frontend", contractSymbols: ["Note"] },
    { id: "JOBS", title: "jobs", prompt: "run jobs", allowedPaths: ["jobs/**"], component: "worker", contractSymbols: ["Job"] },
  ],
};
const runTurn: TurnRunner = async (prompt) => fenced(prompt.includes("Write a lightweight blueprint") ? BLUEPRINT : PLAN);
const verifyOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["tests"], detail: "ok" });

interface Seen { readonly id: string; readonly cwd: string; readonly prompt: string }

function recordingWorker(seen: Seen[], editor: (cwd: string, prompt: string) => Promise<void>, requestFrom: (seenBefore: number) => boolean): RunWorker {
  return async ({ task }) => {
    seen.push({ id: task.id, cwd: task.cwd, prompt: task.prompt });
    if (task.id.startsWith("contract-v")) {
      await editor(task.cwd, task.prompt);
      return { status: "ok" };
    }
    const dir = { API: "api", WEB: "web", JOBS: "jobs" }[task.id] ?? "x";
    await mkdir(join(task.cwd, dir), { recursive: true });
    await writeFile(join(task.cwd, dir, "index.js"), `export const owner = "${task.id}";\n`);
    const asks = task.id === "WEB" && requestFrom(seen.filter((entry) => entry.id === "WEB").length);
    return { status: "ok", finalMessage: asks ? `List page done without titles.\n${REQUEST}` : "done" };
  };
}

const roundsOf = (seen: readonly Seen[], sizes: readonly number[]): readonly (readonly string[])[] =>
  sizes.map((size, index) => {
    const start = sizes.slice(0, index).reduce((total, each) => total + each, 0);
    return seen.slice(start, start + size).map((entry) => entry.id).sort();
  });

const bumpsVersion = async (cwd: string, prompt: string) => {
  const version = /set CONTRACT_VERSION to (\d+)/.exec(prompt)?.[1] ?? "0";
  const path = join(cwd, ENTRY);
  const updated = (await readFile(path, "utf8")).replace(/CONTRACT_VERSION = \d+/, `CONTRACT_VERSION = ${version}`).replace(" * @property {string} id", " * @property {string} id\n * @property {string} title");
  await writeFile(path, updated);
};

test("a change request bumps the contract, re-runs only the tasks that read the symbol, and integrates on the new contract", async () => {
  const repo = await greenfieldRepo();
  const seen: Seen[] = [];
  const result = await planAndRun({ request: "notes", repoRoot: repo, runTurn, verify: verifyOk, shouldInstall: false, runWorker: recordingWorker(seen, bumpsVersion, (count) => count === 1) });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.equal(seen.length, 6);
  assert.deepEqual(roundsOf(seen, [3, 1, 2]), [["API", "JOBS", "WEB"], ["contract-v2"], ["API", "WEB"]]);
  const reruns = seen.slice(4);
  assert.ok(reruns.every((entry) => entry.prompt.includes("The shared contract changed and is now version 2")));
  assert.ok(reruns.every((entry) => entry.cwd.endsWith(".r1")));
  assert.ok(seen[0]?.prompt.includes("contractChangeRequest"));
  assert.equal(result.report.status, "ok");
  const events = await readLedger(join(repo, ".weave"), result.report.runId);
  const changed = events.find((event) => event.type === "contract.changed");
  assert.deepEqual(changed?.type === "contract.changed" && [changed.version, changed.requestedBy, changed.rerun], [2, "WEB", ["API", "WEB"]]);
  const integrated = await runGit(repo, ["show", `${result.report.integration?.branch}:${ENTRY}`]);
  assert.match(integrated.output, /CONTRACT_VERSION = 2/);
  assert.match(integrated.output, /@property \{string\} title/);
});

test("an editor that forgets to bump the version is rejected and nothing re-runs", async () => {
  const repo = await greenfieldRepo();
  const seen: Seen[] = [];
  const forgetful = async (cwd: string) => writeFile(join(cwd, ENTRY), "export const CONTRACT_VERSION = 1;\n// edited\n");
  const result = await planAndRun({ request: "notes", repoRoot: repo, runTurn, verify: verifyOk, shouldInstall: false, runWorker: recordingWorker(seen, forgetful, () => true) });
  assert.equal(result.status, "ran");
  if (result.status !== "ran") return;
  assert.equal(seen.length, 4);
  assert.deepEqual(roundsOf(seen, [3, 1]), [["API", "JOBS", "WEB"], ["contract-v2"]]);
  const events = await readLedger(join(repo, ".weave"), result.report.runId);
  const rejected = events.find((event) => event.type === "contract.change.rejected");
  assert.equal(rejected?.type === "contract.change.rejected" && rejected.reason, "the edited contract does not set CONTRACT_VERSION = 2");
});

test("revisions stop at the cap even when a worker keeps asking", async () => {
  const repo = await greenfieldRepo();
  const seen: Seen[] = [];
  const result = await planAndRun({ request: "notes", repoRoot: repo, runTurn, verify: verifyOk, shouldInstall: false, runWorker: recordingWorker(seen, bumpsVersion, () => true) });
  assert.equal(result.status, "ran");
  assert.equal(seen.filter((entry) => entry.id.startsWith("contract-v")).length, 2);
  assert.deepEqual(seen.filter((entry) => entry.id.startsWith("contract-v")).map((entry) => entry.id), ["contract-v2", "contract-v3"]);
});
